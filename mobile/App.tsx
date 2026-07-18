import React, {useEffect, useRef} from 'react';
import {Platform} from 'react-native';
import {StripeProvider} from '@stripe/stripe-react-native';
import notifee, {EventType, Notification} from '@notifee/react-native';
import {
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
  requestPermission,
  type FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AppNavigator, {navigationRef} from './src/navigation/AppNavigator';
import {useAuthStore} from './src/store/authStore';
import {
  initializeNotificationService,
  showNewMessageNotification,
} from './src/services/notificationService';
import {chatService} from './src/services/chatService';
import {pushTokenService} from './src/services/pushTokenService';
import {STRIPE_PUBLISHABLE_KEY} from './src/config';

type PendingChatRoute = {otherId: string; otherName: string};

export default function App() {
  const loadFromStorage = useAuthStore(s => s.loadFromStorage);
  const user = useAuthStore(s => s.user);
  const pendingChatRouteRef = useRef<PendingChatRoute | null>(null);
  const unreadByConversationRef = useRef<Record<string, number>>({});
  const hasUnreadBaselineRef = useRef(false);

  const extractChatRouteFromNotification = (notification?: Notification): PendingChatRoute | null => {
    const otherId = notification?.data?.otherId;
    const otherName = notification?.data?.otherName;

    if (typeof otherId !== 'string' || typeof otherName !== 'string') {
      return null;
    }

    return {otherId, otherName};
  };

  const openChatFromNotification = (route: PendingChatRoute) => {
    if (!user) {
      pendingChatRouteRef.current = route;
      return;
    }

    if (!navigationRef.isReady()) {
      pendingChatRouteRef.current = route;
      return;
    }

    pendingChatRouteRef.current = null;
    navigationRef.navigate('Chat', route);
  };

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    let unsubscribe = () => {};
    try {
      unsubscribe = notifee.onForegroundEvent(({type, detail}) => {
        if (type !== EventType.PRESS && type !== EventType.ACTION_PRESS) {
          return;
        }

        const route = extractChatRouteFromNotification(detail.notification);
        if (route) {
          openChatFromNotification(route);
        }
      });
    } catch {
      // silently fail
    }

    const fcm = getMessaging();

    const unsubscribeNotificationOpened = onNotificationOpenedApp(fcm, remoteMessage => {
      const route = extractChatRouteFromRemoteData(remoteMessage?.data);
      if (route) {
        openChatFromNotification(route);
      }
    });

    const unsubscribeForegroundMessages = onMessage(fcm, async remoteMessage => {
      const route = extractChatRouteFromRemoteData(remoteMessage.data);
      if (!route) {
        return;
      }

      await showNewMessageNotification({
        otherId: route.otherId,
        otherName: route.otherName,
        senderName: route.otherName,
        messagePreview: remoteMessage.notification?.body ?? remoteMessage.data?.content ?? 'New message',
        unreadCount: 1,
        timestampMs: remoteMessage.sentTime,
      });
    });

    notifee
      .getInitialNotification()
      .then(initial => {
        const route = extractChatRouteFromNotification(initial?.notification);
        if (route) {
          openChatFromNotification(route);
        }
      })
      .catch(() => {
        // silently fail
      });

    getInitialNotification(fcm)
      .then(initial => {
        const route = extractChatRouteFromRemoteData(initial?.data);
        if (route) {
          openChatFromNotification(route);
        }
      })
      .catch(() => {
        // silently fail
      });

    return () => {
      unsubscribe();
      unsubscribeNotificationOpened();
      unsubscribeForegroundMessages();
    };
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const pendingRoute = pendingChatRouteRef.current;
      if (!pendingRoute || !user || !navigationRef.isReady()) {
        return;
      }

      pendingChatRouteRef.current = null;
      navigationRef.navigate('Chat', pendingRoute);
    }, 500);

    return () => clearInterval(intervalId);
  }, [user]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !user) {
      return;
    }

    const registerPushToken = async () => {
      try {
        // Request permission and create the channel only after login to avoid
        // first-launch startup instability on newer Android versions.
        await initializeNotificationService();
        const fcm = getMessaging();
        await registerDeviceForRemoteMessages(fcm);
        await requestPermission(fcm);
        const token = await getToken(fcm);
        await pushTokenService.registerDeviceToken(token, 'android');
      } catch {
        // silently fail
      }
    };

    registerPushToken();

    const unsubscribeTokenRefresh = onTokenRefresh(getMessaging(), async token => {
      try {
        await pushTokenService.registerDeviceToken(token, 'android');
      } catch {
        // silently fail
      }
    });

    return () => {
      unsubscribeTokenRefresh();
    };
  }, [user]);

  // Polling fallback: detects new messages without depending on FCM delivery.
  // Works immediately in dev/emulator. FCM push (above) handles background/killed.
  useEffect(() => {
    if (!user) {
      unreadByConversationRef.current = {};
      hasUnreadBaselineRef.current = false;
      return;
    }

    let isMounted = true;

    const checkConversations = async () => {
      try {
        const {data: conversations} = await chatService.getConversations();
        if (!isMounted) {
          return;
        }

        const previousUnread = unreadByConversationRef.current;
        const nextUnread: Record<string, number> = {};

        for (const conversation of conversations) {
          const currentUnread = conversation.unreadCount ?? 0;
          const previous = previousUnread[conversation.otherId] ?? 0;
          nextUnread[conversation.otherId] = currentUnread;

          if (hasUnreadBaselineRef.current && currentUnread > previous) {
            await showNewMessageNotification({
              otherId: conversation.otherId,
              otherName: conversation.otherName,
              senderName: conversation.otherName,
              messagePreview: conversation.lastMessage,
              unreadCount: currentUnread,
              timestampMs: parseApiTimestampToMs(conversation.lastMessageTime),
            });
          }
        }

        unreadByConversationRef.current = nextUnread;
        hasUnreadBaselineRef.current = true;
      } catch {
        // silently fail
      }
    };

    checkConversations();
    const intervalId = setInterval(checkConversations, 10000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [user]);

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} urlScheme="alugatek">
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </StripeProvider>
  );
}

function extractChatRouteFromRemoteData(
  data?: FirebaseMessagingTypes.RemoteMessage['data'],
): PendingChatRoute | null {
  const otherId = data?.otherId;
  const otherName = data?.otherName;

  if (typeof otherId !== 'string' || typeof otherName !== 'string') {
    return null;
  }

  return {otherId, otherName};
}

function parseApiTimestampToMs(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const hasTimezone = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(value);
  const normalized = hasTimezone ? value : `${value}Z`;
  const parsed = Date.parse(normalized);

  if (Number.isNaN(parsed)) {
    return undefined;
  }

  const year = new Date(parsed).getUTCFullYear();
  if (year < 2000) {
    return undefined;
  }

  return parsed;
}
