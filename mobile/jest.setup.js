/**
 * Global Jest setup: replaces native modules that have no JS implementation
 * in the test environment with their official (or minimal in-memory) mocks.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({data: {user: {email: 'ana@example.com'}}})),
    signOut: jest.fn(() => Promise.resolve()),
    getTokens: jest.fn(() => Promise.resolve({idToken: 'google-id-token'})),
  },
  statusCodes: {},
}));

jest.mock('@react-native-firebase/app', () => ({
  getApp: jest.fn(() => ({name: '[DEFAULT]'})),
}));

jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(() => Promise.resolve()),
  logSignUp: jest.fn(() => Promise.resolve()),
  logLogin: jest.fn(() => Promise.resolve()),
  logSelectItem: jest.fn(() => Promise.resolve()),
  logPurchase: jest.fn(() => Promise.resolve()),
  setUserId: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(() => Promise.resolve('device-token')),
  requestPermission: jest.fn(() => Promise.resolve(1)),
  onMessage: jest.fn(() => jest.fn()),
  onTokenRefresh: jest.fn(() => jest.fn()),
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    requestPermission: jest.fn(() => Promise.resolve()),
    createChannel: jest.fn(() => Promise.resolve('default')),
    displayNotification: jest.fn(() => Promise.resolve()),
    onForegroundEvent: jest.fn(() => jest.fn()),
  },
  AndroidImportance: {HIGH: 4},
  EventType: {PRESS: 1},
}));

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(() => Promise.resolve({assets: []})),
  launchCamera: jest.fn(() => Promise.resolve({assets: []})),
}));

jest.mock('react-native-safe-area-context', () => {
  const inset = {top: 0, right: 0, bottom: 0, left: 0};
  return {
    SafeAreaProvider: ({children}) => children,
    SafeAreaView: ({children}) => children,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({x: 0, y: 0, width: 390, height: 844}),
  };
});
