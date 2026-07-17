import axios from 'axios';
const configuredUrl = import.meta.env.VITE_API_URL?.trim();
const baseURL = configuredUrl && configuredUrl.length > 0
    ? configuredUrl
    : 'https://api.alugatek.pt/api';
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
