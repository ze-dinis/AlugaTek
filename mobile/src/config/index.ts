import {Platform} from 'react-native';

// Development API URL for physical devices and emulators.
const DEV_API_HOST = Platform.select({
  android: '10.0.2.2',
  ios: 'localhost',
  default: 'localhost',
});

export const API_BASE_URL = __DEV__
  ? `http://${DEV_API_HOST}:5000/api`
  : 'https://api.alugatek.pt/api';

export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

function normalizeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export function resolveApiAssetUrl(url?: string | null): string | undefined {
  if (!url) {
    return undefined;
  }

  if (url.startsWith('/')) {
    return `${API_ORIGIN}${url}`;
  }

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      const currentOrigin = normalizeOrigin(API_ORIGIN);
      const isLocalBackendPath = parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '0.0.0.0' ||
        parsed.pathname.startsWith('/uploads/') ||
        parsed.pathname.startsWith('/api/');

      if (__DEV__ && isLocalBackendPath) {
        return `${currentOrigin}${parsed.pathname}${parsed.search}`;
      }

      if (parsed.origin === currentOrigin) {
        return `${currentOrigin}${parsed.pathname}${parsed.search}`;
      }

      return url;
    } catch {
      return url;
    }
  }

  return `${API_ORIGIN}/${url.replace(/^\/+/, '')}`;
}

export const GOOGLE_WEB_CLIENT_ID = 'YOUR_GOOGLE_WEB_CLIENT_ID';
