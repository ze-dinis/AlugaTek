import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAuthStore} from '../authStore';
import {User} from '../../types';

const user: User = {
  id: 'a1b2c3',
  name: 'Ana Silva',
  email: 'ana@example.com',
};

describe('useAuthStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useAuthStore.setState({user: null, token: null, isLoading: true});
  });

  it('starts empty and loading', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isLoading).toBe(true);
  });

  it('persists the session on setAuth', async () => {
    await useAuthStore.getState().setAuth(user, 'jwt-token');

    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().token).toBe('jwt-token');
    await expect(AsyncStorage.getItem('auth_token')).resolves.toBe('jwt-token');
    await expect(AsyncStorage.getItem('auth_user')).resolves.toBe(
      JSON.stringify(user),
    );
  });

  it('clears state and storage on logout', async () => {
    await useAuthStore.getState().setAuth(user, 'jwt-token');

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    await expect(AsyncStorage.getItem('auth_token')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('auth_user')).resolves.toBeNull();
  });

  it('rehydrates a persisted session from storage', async () => {
    await AsyncStorage.setItem('auth_token', 'jwt-token');
    await AsyncStorage.setItem('auth_user', JSON.stringify(user));

    await useAuthStore.getState().loadFromStorage();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(user);
    expect(state.token).toBe('jwt-token');
    expect(state.isLoading).toBe(false);
  });

  it('finishes loading even when nothing is stored', async () => {
    await useAuthStore.getState().loadFromStorage();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('stops loading when the stored user payload is corrupt', async () => {
    await AsyncStorage.setItem('auth_token', 'jwt-token');
    await AsyncStorage.setItem('auth_user', '{not-json');

    await useAuthStore.getState().loadFromStorage();

    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});
