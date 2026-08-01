import axios from 'axios';

const configuredUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const baseURL = configuredUrl && configuredUrl.length > 0
  ? configuredUrl
  : 'https://api.alugatek.pt/api';

export const api = axios.create({
  baseURL,
  timeout: 15000,
});

const apiOrigin = baseURL.replace(/\/api\/?$/, '');

export function resolveApiAssetUrl(url?: string | null): string | undefined {
  if (!url || !url.trim()) return undefined;

  const trimmed = url.trim();
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed;
  }

  return `${apiOrigin}/${trimmed.replace(/^\/+/, '')}`;
}

api.interceptors.request.use(config => {
  const token = localStorage.getItem('support_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
