import {AxiosRequestConfig, InternalAxiosRequestConfig} from 'axios';
import api from '../services/api';

export type MockedRoute = {
  method: string;
  url: string;
  status?: number;
  data?: unknown;
};

export type RecordedRequest = {
  method: string;
  url: string;
  data: unknown;
  params?: unknown;
  headers: Record<string, unknown>;
};

function normalize(value: string): string {
  return value.replace(/\/+$/, '') || '/';
}

/**
 * Replaces the axios transport with an in-memory one so screens exercise the
 * real service + interceptor + store stack without touching the network.
 */
export function installHttpMock() {
  const originalAdapter = api.defaults.adapter;
  const routes: MockedRoute[] = [];
  const requests: RecordedRequest[] = [];

  api.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const method = (config.method ?? 'get').toLowerCase();
    const url = normalize(config.url ?? '');

    let body: unknown = config.data;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // Leave non-JSON payloads (e.g. FormData serialized bodies) as-is.
      }
    }

    requests.push({
      method,
      url,
      data: body,
      params: config.params,
      headers: {...(config.headers as unknown as Record<string, unknown>)},
    });

    const route = routes.find(r => r.method === method && normalize(r.url) === url);
    const status = route?.status ?? (route ? 200 : 404);

    // status 0 models a transport failure (no response), which is what the app
    // treats as "backend unreachable".
    if (route && status === 0) {
      throw Object.assign(new Error('Network Error'), {
        isAxiosError: true,
        code: 'ERR_NETWORK',
        config,
        response: undefined,
        toJSON: () => ({}),
      });
    }

    const response = {
      data: route?.data ?? {},
      status,
      statusText: '',
      headers: {},
      config: config as AxiosRequestConfig,
    };

    if (status >= 400) {
      throw Object.assign(new Error(`Request failed with status ${status}`), {
        isAxiosError: true,
        config,
        response,
        toJSON: () => ({}),
      });
    }

    return response;
  }) as never;

  return {
    requests,
    /** Registers the canned response for a given method + path. */
    on(method: string, url: string, status: number, data?: unknown) {
      routes.push({method: method.toLowerCase(), url, status, data});
    },
    /** Registers a transport-level failure (no HTTP response) for a path. */
    onNetworkError(method: string, url: string) {
      routes.push({method: method.toLowerCase(), url, status: 0});
    },
    lastRequest() {
      return requests[requests.length - 1];
    },
    requestsTo(method: string, url: string) {
      const wanted = normalize(url);
      return requests.filter(r => r.method === method.toLowerCase() && r.url === wanted);
    },
    restore() {
      api.defaults.adapter = originalAdapter;
    },
  };
}

export type HttpMock = ReturnType<typeof installHttpMock>;
