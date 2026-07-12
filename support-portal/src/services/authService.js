import { api } from '../lib/api';
export const authService = {
    login: async (payload) => {
        const { data } = await api.post('/support/auth/login', payload);
        return data;
    },
};
