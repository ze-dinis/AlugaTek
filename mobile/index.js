/**
 * @format
 */

import {AppRegistry} from 'react-native';
import {getMessaging, setBackgroundMessageHandler} from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native';
import App from './App';

// Register the root component first: if a native module below is still
// initializing on a cold start, the app must still have something to render
// instead of dying before it appears.
AppRegistry.registerComponent('Alugatek', () => App);

try {
  setBackgroundMessageHandler(getMessaging(), async () => {});
} catch {
  // Firebase native module not ready on this launch.
}

try {
  // Notifee requires a background event handler registered at the entry point.
  notifee.onBackgroundEvent(async () => {});
} catch {
  // Notifee native module not ready on this launch.
}
