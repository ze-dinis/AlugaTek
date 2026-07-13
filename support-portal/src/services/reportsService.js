import { api } from '../lib/api';
export const reportsService = {
    getAll: async () => {
        const { data } = await api.get('/support/reports');
        return data;
    },
};
