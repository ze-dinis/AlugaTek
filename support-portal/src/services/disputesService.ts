import { api } from '../lib/api';
import type {
  BanAccountRequest,
  DisputeDetail,
  DisputeSummary,
  DisputeStatus,
} from '../types/disputes';

export const disputesService = {
  getInbox: async (status?: DisputeStatus) => {
    const { data } = await api.get<DisputeSummary[]>('/support/disputes', {
      params: status ? { status } : undefined,
    });
    return data;
  },

  getById: async (id: string) => {
    const { data } = await api.get<DisputeDetail>(`/support/disputes/${id}`);
    return data;
  },

  reply: async (id: string, content: string) => {
    await api.post(`/support/disputes/${id}/reply`, { content });
  },

  assign: async (id: string, assigneeUserId: string) => {
    await api.patch(`/support/disputes/${id}/assign`, { assigneeUserId });
  },

  resolve: async (id: string, resolutionNote: string) => {
    await api.patch(`/support/disputes/${id}/resolve`, { resolutionNote });
  },

  banUser: async (userId: string, payload: BanAccountRequest) => {
    await api.post(`/support/users/${userId}/ban`, payload);
  },
};
