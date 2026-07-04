// Development API URL for physical devices and emulators.
// Change this to your computer's LAN IP when testing on a real phone.
const DEV_API_HOST = '192.168.1.119';

export const API_BASE_URL = __DEV__
  ? `http://${DEV_API_HOST}:5000/api`
  : 'https://api.alugatek.pt/api';

export const GOOGLE_WEB_CLIENT_ID = 'YOUR_GOOGLE_WEB_CLIENT_ID';
