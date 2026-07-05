import axios, {InternalAxiosRequestConfig} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {API_BASE_URL, DEV_ANDROID_API_FALLBACK_BASE_URLS} from '../config';

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _fallbackAttemptIndex?: number;
};

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
  const token = await AsyncStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  response => response,
  async error => {
    const config = error.config as RetryableRequestConfig | undefined;

    // In Android dev we retry network failures against alternative local hosts
    // to support both emulator (10.0.2.2) and physical device (localhost/LAN).
    if (__DEV__ && Platform.OS === 'android' && !error.response && config) {
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

    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('auth_token');
    }
    return Promise.reject(error);
  },
);

export default api;
