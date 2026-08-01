import AsyncStorage from '@react-native-async-storage/async-storage';
import {AxiosHeaders, InternalAxiosRequestConfig} from 'axios';
import api from '../api';
import {authClient} from '../authClient';
import {useAuthStore} from '../../store/authStore';

type AdapterResult = {
  status: number;
  data?: unknown;
};

/**
 * Replaces the transport layer so requests never leave the process while the
 * instance's request/response interceptors still run.
 */
function stubTransport(result: AdapterResult) {
  const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
    const response = {
      data: result.data ?? {},
      status: result.status,
      statusText: '',
      headers: {},
      config,
    };

    if (result.status >= 400) {
      // eslint-disable-next-line no-throw-literal
      throw Object.assign(new Error(`Request failed with status ${result.status}`), {
        isAxiosError: true,
        config,
        response,
        toJSON: () => ({}),
      });
    }

    return response;
  });

  api.defaults.adapter = adapter as never;
  return adapter;
}

describe('api client', () => {
  let authRequest: jest.SpyInstance;

  beforeEach(async () => {
    authRequest = jest
      .spyOn(authClient, 'post')
      .mockRejectedValue(new Error('no network'));
    await useAuthStore.getState().logout();
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    authRequest.mockRestore();
  });

  it('targets the configured base URL', () => {
    expect(api.defaults.baseURL).toMatch(/\/api$/);
  });

  it('sends JSON by default', () => {
    expect(api.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('attaches the stored JWT as a bearer token', async () => {
    await AsyncStorage.setItem('auth_token', 'jwt-token');
    const adapter = stubTransport({status: 200});

    await api.get('/items');

    const sentConfig = adapter.mock.calls[0][0];
    expect(new AxiosHeaders(sentConfig.headers).get('Authorization')).toBe(
      'Bearer jwt-token',
    );
  });

  it('sends no Authorization header when signed out', async () => {
    const adapter = stubTransport({status: 200});

    await api.get('/items');

    const sentConfig = adapter.mock.calls[0][0];
    expect(new AxiosHeaders(sentConfig.headers).get('Authorization')).toBeUndefined();
  });

  it('drops the stored token when the backend answers 401', async () => {
    await AsyncStorage.setItem('auth_token', 'expired-token');
    stubTransport({status: 401});

    await expect(api.get('/rentals/my')).rejects.toBeDefined();

    await expect(AsyncStorage.getItem('auth_token')).resolves.toBeNull();
  });

  it('signs the user out completely when the backend answers 401', async () => {
    await useAuthStore
      .getState()
      .setAuth({id: 'user-1', name: 'Ze'} as never, 'expired-token');
    stubTransport({status: 401});

    await expect(api.get('/rentals/my')).rejects.toBeDefined();

    await expect(AsyncStorage.getItem('auth_user')).resolves.toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('renews an expired access token and replays the original request', async () => {
    await useAuthStore
      .getState()
      .setAuth({id: 'user-1', name: 'Ze'} as never, 'expired-token', 'refresh-token');

    authRequest.mockResolvedValueOnce({
      data: {
        token: 'fresh-token',
        refreshToken: 'rotated-refresh-token',
        user: {id: 'user-1', name: 'Ze'},
      },
    } as never);

    let call = 0;
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      call += 1;
      const response = {
        data: call === 1 ? {} : [{id: 'rental-1'}],
        status: call === 1 ? 401 : 200,
        statusText: '',
        headers: {},
        config,
      };

      if (call === 1) {
        throw Object.assign(new Error('Request failed with status 401'), {
          isAxiosError: true,
          config,
          response,
          toJSON: () => ({}),
        });
      }

      return response;
    });
    api.defaults.adapter = adapter as never;

    const result = await api.get('/rentals/my');

    expect(result.data).toEqual([{id: 'rental-1'}]);
    expect(authRequest).toHaveBeenCalledWith(
      '/auth/refresh',
      {refreshToken: 'refresh-token'},
      {baseURL: api.defaults.baseURL},
    );
    expect(new AxiosHeaders(adapter.mock.calls[1][0].headers).get('Authorization')).toBe(
      'Bearer fresh-token',
    );
    await expect(AsyncStorage.getItem('auth_refresh_token')).resolves.toBe(
      'rotated-refresh-token',
    );
    expect(useAuthStore.getState().user).not.toBeNull();
  });

  it('refreshes only once when several requests expire at the same time', async () => {
    await useAuthStore
      .getState()
      .setAuth({id: 'user-1', name: 'Ze'} as never, 'expired-token', 'refresh-token');

    authRequest.mockResolvedValue({
      data: {
        token: 'fresh-token',
        refreshToken: 'rotated-refresh-token',
        user: {id: 'user-1', name: 'Ze'},
      },
    } as never);

    const seen = new Set<string>();
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      const key = `${config.url}`;
      const response = {data: {}, status: 200, statusText: '', headers: {}, config};

      if (!seen.has(key)) {
        seen.add(key);
        throw Object.assign(new Error('Request failed with status 401'), {
          isAxiosError: true,
          config,
          response: {...response, status: 401},
          toJSON: () => ({}),
        });
      }

      return response;
    });
    api.defaults.adapter = adapter as never;

    await Promise.all([
      api.get('/rentals/my'),
      api.get('/chat/conversations'),
      api.get('/items/my'),
    ]);

    expect(authRequest).toHaveBeenCalledTimes(1);
  });

  it('signs the user out when the refresh token is rejected', async () => {
    await useAuthStore
      .getState()
      .setAuth({id: 'user-1', name: 'Ze'} as never, 'expired-token', 'dead-refresh-token');

    authRequest.mockRejectedValue(new Error('Request failed with status 401'));
    stubTransport({status: 401});

    await expect(api.get('/rentals/my')).rejects.toBeDefined();

    expect(useAuthStore.getState().user).toBeNull();
    await expect(AsyncStorage.getItem('auth_user')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('auth_refresh_token')).resolves.toBeNull();
  });

  it('signs the user out on 401 when there is no refresh token', async () => {
    await useAuthStore
      .getState()
      .setAuth({id: 'user-1', name: 'Ze'} as never, 'expired-token');
    stubTransport({status: 401});

    await expect(api.get('/rentals/my')).rejects.toBeDefined();

    expect(authRequest).not.toHaveBeenCalledWith(
      '/auth/refresh',
      expect.anything(),
      expect.anything(),
    );
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('keeps the session on a 401 from an auth endpoint', async () => {
    await useAuthStore
      .getState()
      .setAuth({id: 'user-1', name: 'Ze'} as never, 'jwt-token');
    stubTransport({status: 401});

    await expect(api.post('/auth/login', {})).rejects.toBeDefined();

    expect(useAuthStore.getState().user).not.toBeNull();
  });

  it('keeps the stored token for non-401 failures', async () => {
    await AsyncStorage.setItem('auth_token', 'jwt-token');
    stubTransport({status: 500});

    await expect(api.get('/rentals/my')).rejects.toBeDefined();

    await expect(AsyncStorage.getItem('auth_token')).resolves.toBe('jwt-token');
  });

  it('resolves with the payload returned by the backend', async () => {
    stubTransport({status: 200, data: [{id: 'item-1'}]});

    const response = await api.get('/items');

    expect(response.data).toEqual([{id: 'item-1'}]);
  });
});
