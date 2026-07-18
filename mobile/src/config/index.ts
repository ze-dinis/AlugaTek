import {NativeModules, Platform} from 'react-native';

function getMetroBundleHost(): string | null {
  const sourceCode = (NativeModules as any)?.SourceCode;
  const scriptURL = sourceCode?.scriptURL as string | undefined;

  if (!scriptURL) {
    return null;
  }

  try {
    const parsed = new URL(scriptURL);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

function isAndroidEmulator(): boolean {
  if (Platform.OS !== 'android') {
    return false;
  }

  const constants = Platform.constants as Record<string, unknown>;
  const fingerprint = String(constants.Fingerprint ?? '').toLowerCase();
  const model = String(constants.Model ?? '').toLowerCase();
  const brand = String(constants.Brand ?? '').toLowerCase();
  const manufacturer = String(constants.Manufacturer ?? '').toLowerCase();
  const product = String(constants.Product ?? '').toLowerCase();

  return (
    fingerprint.includes('generic') ||
    model.includes('emulator') ||
    model.includes('sdk') ||
    manufacturer.includes('genymotion') ||
    (brand.startsWith('generic') && product.startsWith('generic')) ||
    product.includes('emulator')
  );
}

// Development API URL for physical devices and emulators.
// On real devices we prefer Metro's host (usually your LAN IP).
const DEV_BUNDLE_HOST = getMetroBundleHost();
const DEV_ANDROID_PRIMARY_HOST = isAndroidEmulator() ? '10.0.2.2' : DEV_BUNDLE_HOST ?? 'localhost';

const DEV_API_HOST = Platform.select({
  android: DEV_ANDROID_PRIMARY_HOST,
  ios: 'localhost',
  default: 'localhost',
});

export const API_BASE_URL = __DEV__
  ? `http://${DEV_API_HOST}:5000/api`
  : 'https://api.alugatek.pt/api';

export const DEV_ANDROID_API_FALLBACK_BASE_URLS = __DEV__
  ? [
      DEV_BUNDLE_HOST ? `http://${DEV_BUNDLE_HOST}:5000/api` : null,
      'http://localhost:5000/api',
      'http://10.0.2.2:5000/api',
      'http://127.0.0.1:5000/api',
    ]
      .filter((value): value is string => Boolean(value))
  : [];

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

type RuntimeConfig = {
  GOOGLE_WEB_CLIENT_ID?: string;
};

function resolveGoogleWebClientId(): string {
  const runtime = (globalThis as unknown as RuntimeConfig).GOOGLE_WEB_CLIENT_ID;
  if (runtime?.trim()) {
    return runtime.trim();
  }

  const env = (globalThis as {
    process?: {
      env?: Record<string, string | undefined>;
    };
  }).process?.env;

  const envValue =
    env?.GOOGLE_WEB_CLIENT_ID ??
    env?.REACT_NATIVE_GOOGLE_WEB_CLIENT_ID ??
    env?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  if (envValue?.trim()) {
    return envValue.trim();
  }

  // Backward-compatible fallback while migrating to env/build config.
  return '412423945668-rin55creh0g3ldbkkckivdu44h0stmt8.apps.googleusercontent.com';
}

export const GOOGLE_WEB_CLIENT_ID = resolveGoogleWebClientId();

// Stripe publishable key — safe to commit (public key, not the secret key).
export const STRIPE_PUBLISHABLE_KEY = __DEV__
  ? 'pk_test_51TqHdrR7bR8HrqNrWeajkGdkRqCUB0rIK628qvSTMJPOJLriKlhTg1Nd2vz4nChVgagbyZhaH7B6dJso5rMQjJnF00uVNZGZ4f'
  : 'pk_test_51TqHdrR7bR8HrqNrWeajkGdkRqCUB0rIK628qvSTMJPOJLriKlhTg1Nd2vz4nChVgagbyZhaH7B6dJso5rMQjJnF00uVNZGZ4f';
