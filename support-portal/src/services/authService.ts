import { api } from '../lib/api';
import type { SupportLoginResponse } from '../types/disputes';

interface LoginPayload {
  email: string;
  password: string;
}

export const authService = {
  login: async (payload: LoginPayload) => {
    const { data } = await api.post<SupportLoginResponse>('/support/auth/login', payload);
    return data;
  },
};
