import { api } from '../lib/api';
export const disputesService = {
    getInbox: async (status) => {
        const { data } = await api.get('/support/disputes', {
            params: status ? { status } : undefined,
        });
        return data;
    },
    getById: async (id) => {
        const { data } = await api.get(`/support/disputes/${id}`);
        return data;
    },
    reply: async (id, content) => {
        await api.post(`/support/disputes/${id}/reply`, { content });
    },
    assign: async (id, assigneeUserId) => {
        await api.patch(`/support/disputes/${id}/assign`, { assigneeUserId });
    },
    resolve: async (id, resolutionNote) => {
        await api.patch(`/support/disputes/${id}/resolve`, { resolutionNote });
    },
    banUser: async (userId, payload) => {
        await api.post(`/support/users/${userId}/ban`, payload);
    },
};
