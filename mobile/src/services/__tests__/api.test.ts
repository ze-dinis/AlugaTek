import AsyncStorage from '@react-native-async-storage/async-storage';
import {AxiosHeaders, InternalAxiosRequestConfig} from 'axios';
import api from '../api';

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
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
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
