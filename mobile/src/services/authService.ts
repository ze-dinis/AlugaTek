import api from './api';
import {AuthResponse} from '../types';

export const authService = {
  register: (name: string, email: string, password: string) =>
    api.post<AuthResponse>('/auth/register', {name, email, password}),

  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', {email, password}),

  googleOAuth: (idToken: string) =>
    api.post<AuthResponse>('/auth/oauth/google', JSON.stringify(idToken), {
      headers: {'Content-Type': 'application/json'},
    }),
};
