import axios from 'axios';
import {API_BASE_URL} from '../config';

export const AUTH_TOKEN_KEY = 'auth_token';
export const AUTH_USER_KEY = 'auth_user';
export const AUTH_REFRESH_TOKEN_KEY = 'auth_refresh_token';

/**
 * Interceptor-free client used for refreshing and revoking sessions.
 * Going through the main `api` instance would re-enter the 401 handler and
 * recurse, so token maintenance deliberately bypasses it.
 */
export const authClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {'Content-Type': 'application/json'},
});
