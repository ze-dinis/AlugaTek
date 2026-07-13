import axios from 'axios';
const baseURL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:5000/api' : 'https://api.alugatek.pt/api');
export const api = axios.create({
    baseURL,
    timeout: 15000,
});
api.interceptors.request.use(config => {
    const token = localStorage.getItem('support_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
