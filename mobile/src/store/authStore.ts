import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {User} from '../types';
import {
  AUTH_REFRESH_TOKEN_KEY,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  authClient,
} from '../services/authClient';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  setAuth: (user: User, token: string, refreshToken?: string | null) => Promise<void>;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  token: null,
  refreshToken: null,
  isLoading: true,

  setAuth: async (user, token, refreshToken) => {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));

    if (refreshToken) {
      await AsyncStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken);
    } else {
      await AsyncStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
    }

    set({user, token, refreshToken: refreshToken ?? null});
  },

  logout: async () => {
    const storedRefreshToken = await AsyncStorage.getItem(AUTH_REFRESH_TOKEN_KEY);

    // Clear locally first so signing out never depends on the network.
    await AsyncStorage.multiRemove([
      AUTH_TOKEN_KEY,
      AUTH_USER_KEY,
      AUTH_REFRESH_TOKEN_KEY,
    ]);
    set({user: null, token: null, refreshToken: null});

    if (storedRefreshToken) {
      try {
        await authClient.post('/auth/logout', {refreshToken: storedRefreshToken});
      } catch {
        // Best effort: the token expires server-side on its own anyway.
      }
    }
  },

  loadFromStorage: async () => {
    try {
      const [token, userStr, refreshToken] = await AsyncStorage.multiGet([
        AUTH_TOKEN_KEY,
        AUTH_USER_KEY,
        AUTH_REFRESH_TOKEN_KEY,
      ]);
      const storedToken = token[1];
      const storedUser = userStr[1] ? JSON.parse(userStr[1]) : null;

      // A user without a token (or vice versa) is a half-written session: it
      // renders the logged-in shell while every request 401s. Treat it as
      // signed out instead.
      if (!storedToken || !storedUser) {
        set({user: null, token: null, refreshToken: null, isLoading: false});
        return;
      }

      set({
        user: storedUser,
        token: storedToken,
        refreshToken: refreshToken[1],
        isLoading: false,
      });
    } catch {
      set({user: null, token: null, refreshToken: null, isLoading: false});
    }
  },
}));
