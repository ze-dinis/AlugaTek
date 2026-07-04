// Central API base URL — change this to your machine's IP when testing on a real device
export const API_BASE_URL = __DEV__
  ? 'http://10.0.2.2:5000/api'   // Android emulator → localhost
  : 'https://api.alugatek.com/api';

export const GOOGLE_WEB_CLIENT_ID = 'YOUR_GOOGLE_WEB_CLIENT_ID';
