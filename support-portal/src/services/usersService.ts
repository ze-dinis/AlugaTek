import { api } from '../lib/api';

export interface BanByEmailRequest {
  email: string;
  reason: string;
  durationDays?: number;
}

export interface BanByEmailResponse {
  id: string;
  email: string;
  isBanned: boolean;
  bannedAt: string;
  bannedUntil: string | null;
  banReason: string;
}

export const usersService = {
  banByEmail: async (payload: BanByEmailRequest): Promise<BanByEmailResponse> => {
    const { data } = await api.post<BanByEmailResponse>('/support/users/ban-by-email', payload);
    return data;
  },
};
