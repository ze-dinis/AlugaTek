/**
 * @format
 */

import {AppRegistry} from 'react-native';
import {getMessaging, setBackgroundMessageHandler} from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native';
import App from './App';

setBackgroundMessageHandler(getMessaging(), async () => {});

// Notifee requires a background event handler registered at the entry point.
notifee.onBackgroundEvent(async () => {});

AppRegistry.registerComponent('Alugatek', () => App);
