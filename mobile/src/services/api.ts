import axios, {InternalAxiosRequestConfig} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {API_BASE_URL, DEV_ANDROID_API_FALLBACK_BASE_URLS} from '../config';
import {useAuthStore} from '../store/authStore';
import {
  AUTH_REFRESH_TOKEN_KEY,
  AUTH_TOKEN_KEY,
  authClient,
} from './authClient';
import {AuthResponse} from '../types';

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _fallbackAttemptIndex?: number;
  _retriedAfterRefresh?: boolean;
};

function isIdempotentMethod(method?: string): boolean {
  const normalized = (method ?? 'get').toLowerCase();
  return normalized === 'get' || normalized === 'head' || normalized === 'options';
}

function isAuthEndpoint(url?: string): boolean {
  if (!url) {
    return false;
  }

  return /(^|\/)auth\//.test(url);
}

function getAndroidFallbackBaseUrls(currentBaseUrl?: string): string[] {
  const ordered = [currentBaseUrl, ...DEV_ANDROID_API_FALLBACK_BASE_URLS].filter(
    (value): value is string => Boolean(value),
  );

  return [...new Set(ordered)];
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {'Content-Type': 'application/json'},
});

// Attach JWT token to every request
api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Only one refresh may be in flight; every request that hits a 401 in the
// meantime awaits the same promise instead of spawning its own refresh.
let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(baseURL?: string): Promise<string | null> {
  const refreshToken = await AsyncStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    return null;
  }

  const {data} = await authClient.post<AuthResponse>(
    '/auth/refresh',
    {refreshToken},
    baseURL ? {baseURL} : undefined,
  );

  if (!data?.token) {
    return null;
  }

  await useAuthStore.getState().setAuth(data.user, data.token, data.refreshToken);
  return data.token;
}

function refreshAccessToken(baseURL?: string): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh(baseURL)
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

// Handle 401 globally
api.interceptors.response.use(
  response => response,
  async error => {
    const config = error.config as RetryableRequestConfig | undefined;

    // In Android dev we retry network failures against alternative local hosts
    // to support both emulator (10.0.2.2) and physical device (localhost/LAN).
    if (
      __DEV__
      && Platform.OS === 'android'
      && !error.response
      && config
      && isIdempotentMethod(config.method)
    ) {
      const fallbackBaseUrls = getAndroidFallbackBaseUrls(
        config.baseURL ?? api.defaults.baseURL,
      );
      const currentAttempt = config._fallbackAttemptIndex ?? 0;
      const nextAttempt = currentAttempt + 1;

      if (nextAttempt < fallbackBaseUrls.length) {
        config._fallbackAttemptIndex = nextAttempt;
        config.baseURL = fallbackBaseUrls[nextAttempt];
        return api.request(config);
      }
    }

    // An expired access token is renewed transparently with the refresh token so
    // the user is not kicked out mid-session. Only when the refresh itself fails
    // (revoked/expired/absent) do we sign out completely — leaving `auth_user`
    // behind previously made the app look logged in while every call 401'd.
    if (
      error.response?.status === 401
      && config
      && !isAuthEndpoint(config.url)
    ) {
      if (!config._retriedAfterRefresh) {
        config._retriedAfterRefresh = true;

        const newToken = await refreshAccessToken(config.baseURL);
        if (newToken) {
          config.headers.Authorization = `Bearer ${newToken}`;
          return api.request(config);
        }
      }

      await useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);

export default api;
