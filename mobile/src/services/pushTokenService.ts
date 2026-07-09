import api from './api';

export const pushTokenService = {
  registerDeviceToken: (token: string, platform: 'android' | 'ios') =>
    api.post('/notifications/device-token/register', {token, platform}),

  unregisterDeviceToken: (token: string) =>
    api.post('/notifications/device-token/unregister', {token}),
};
