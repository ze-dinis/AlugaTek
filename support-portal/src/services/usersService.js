import { api } from '../lib/api';
export const usersService = {
    banByEmail: async (payload) => {
        const { data } = await api.post('/support/users/ban-by-email', payload);
        return data;
    },
};
