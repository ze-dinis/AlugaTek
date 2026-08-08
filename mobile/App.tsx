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
import {pushTokenService} from './src/services/pushTokenService';
import {STRIPE_PUBLISHABLE_KEY} from './src/config';

type NotificationThreadData = {
  otherUserId: string;
  otherName: string;
  itemId?: string;
  itemTitle?: string;
};

type PendingChatRoute = {
  otherUserId: string;
  otherName: string;
  itemId: string;
  itemTitle: string;
};

type NotificationIdentity = {
  messageId?: string;
  eventId?: string;
};

const NOTIFICATION_DEDUPE_WINDOW_MS = 15000;

function safeGetMessaging(): ReturnType<typeof getMessaging> | null {
  try {
    return getMessaging();
  } catch {
    return null;
  }
}

export default function App() {
  const loadFromStorage = useAuthStore(s => s.loadFromStorage);
  const user = useAuthStore(s => s.user);
  const pendingChatRouteRef = useRef<PendingChatRoute | null>(null);
  const recentNotificationKeysRef = useRef<Record<string, number>>({});

  const shouldDisplayNotification = (
    otherUserId: string,
    itemId: string | undefined,
    messagePreview: string,
    timestampMs?: number,
    eventId?: string,
  ): boolean => {
    const now = Date.now();
    if (eventId) {
      const existingTimestamp = recentNotificationKeysRef.current[eventId];
      for (const key of Object.keys(recentNotificationKeysRef.current)) {
        if (now - recentNotificationKeysRef.current[key] > NOTIFICATION_DEDUPE_WINDOW_MS) {
          delete recentNotificationKeysRef.current[key];
        }
      }

      if (existingTimestamp && now - existingTimestamp < NOTIFICATION_DEDUPE_WINDOW_MS) {
        return false;
      }

      recentNotificationKeysRef.current[eventId] = now;
      return true;
    }

    const itemPart = itemId ?? 'none';
    const previewPart = messagePreview.trim().toLowerCase();
    const timestampPart = Number.isFinite(timestampMs)
      ? Math.floor(Number(timestampMs) / 5000).toString()
      : 'na';
    const dedupeKey = `${otherUserId}:${itemPart}:${previewPart}:${timestampPart}`;
    const previousTimestamp = recentNotificationKeysRef.current[dedupeKey];

    for (const key of Object.keys(recentNotificationKeysRef.current)) {
      if (now - recentNotificationKeysRef.current[key] > NOTIFICATION_DEDUPE_WINDOW_MS) {
        delete recentNotificationKeysRef.current[key];
      }
    }

    if (previousTimestamp && now - previousTimestamp < NOTIFICATION_DEDUPE_WINDOW_MS) {
      return false;
    }

    recentNotificationKeysRef.current[dedupeKey] = now;
    return true;
  };

  const extractChatRouteFromNotification = (notification?: Notification): NotificationThreadData | null => {
    const otherUserId = notification?.data?.otherUserId ?? notification?.data?.otherId;
    const otherName = notification?.data?.otherName;
    const itemId = notification?.data?.itemId;
    const itemTitle = notification?.data?.itemTitle;

    if (typeof otherUserId !== 'string' || typeof otherName !== 'string') {
      return null;
    }

    return {
      otherUserId,
      otherName,
      itemId: typeof itemId === 'string' ? itemId : undefined,
      itemTitle: typeof itemTitle === 'string' ? itemTitle : undefined,
    };
  };

  const openChatFromNotification = (route: NotificationThreadData) => {
    if (!route.itemId || !route.itemTitle) {
      return;
    }

    const chatRoute: PendingChatRoute = {
      otherUserId: route.otherUserId,
      otherName: route.otherName,
      itemId: route.itemId,
      itemTitle: route.itemTitle,
    };

    if (!user) {
      pendingChatRouteRef.current = chatRoute;
      return;
    }

    if (!navigationRef.isReady()) {
      pendingChatRouteRef.current = chatRoute;
      return;
    }

    pendingChatRouteRef.current = null;
    navigationRef.navigate('Chat', chatRoute);
  };

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    // Native modules may still be initializing during the very first cold start.
    // Anything that throws here takes down the JS thread and closes the app
    // before it renders (which is why it then opens fine on the second try), so
    // every native subscription is registered defensively.
    const cleanups: Array<() => void> = [];

    const subscribe = (register: () => () => void) => {
      try {
        cleanups.push(register());
      } catch {
        // silently fail
      }
    };

    subscribe(() =>
      notifee.onForegroundEvent(({type, detail}) => {
        if (type !== EventType.PRESS && type !== EventType.ACTION_PRESS) {
          return;
        }

        const route = extractChatRouteFromNotification(detail.notification);
        if (route) {
          openChatFromNotification(route);
        }
      }),
    );

    try {
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
    } catch {
      // silently fail
    }

    const fcm = safeGetMessaging();

    if (fcm) {
      subscribe(() =>
        onNotificationOpenedApp(fcm, remoteMessage => {
          const route = extractChatRouteFromRemoteData(remoteMessage?.data);
          if (route) {
            openChatFromNotification(route);
          }
        }),
      );

      subscribe(() =>
        onMessage(fcm, async remoteMessage => {
          const route = extractChatRouteFromRemoteData(remoteMessage.data);
          if (!route) {
            return;
          }
          const identity = extractNotificationIdentityFromRemoteData(remoteMessage.data);

          const messagePreview = remoteMessage.notification?.body
            ?? getRemoteDataString(remoteMessage.data, 'content')
            ?? 'New message';
          if (!shouldDisplayNotification(
            route.otherUserId,
            route.itemId,
            messagePreview,
            remoteMessage.sentTime,
            identity.eventId,
          )) {
            return;
          }

          await showNewMessageNotification({
            otherId: route.otherUserId,
            otherName: route.otherName,
            itemId: route.itemId,
            itemTitle: route.itemTitle,
            senderName: route.otherName,
            messagePreview,
            unreadCount: 1,
            timestampMs: remoteMessage.sentTime,
            eventId: identity.eventId,
          });
        }),
      );

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
    }

    return () => {
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch {
          // silently fail
        }
      }
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

    let unsubscribeTokenRefresh = () => {};

    // On a restored session this effect fires during the cold start, at the
    // same moment the main navigator mounts. Deferring to an idle window keeps
    // the Firebase/notifee permission calls off the critical path where
    // native modules are still initializing.
    const idleHandle = requestIdleCallback(
      () => {
        registerPushToken();

        const messaging = safeGetMessaging();
        if (!messaging) {
          return;
        }

        try {
          unsubscribeTokenRefresh = onTokenRefresh(messaging, async token => {
            try {
              await pushTokenService.registerDeviceToken(token, 'android');
            } catch {
              // silently fail
            }
          });
        } catch {
          // silently fail
        }
      },
      // Never let a busy startup postpone push registration indefinitely.
      {timeout: 5000},
    );

    return () => {
      cancelIdleCallback(idleHandle);
      unsubscribeTokenRefresh();
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
): NotificationThreadData | null {
  const otherUserId = getRemoteDataString(data, 'otherUserId') ?? getRemoteDataString(data, 'otherId');
  const otherName = getRemoteDataString(data, 'otherName');
  const itemId = getRemoteDataString(data, 'itemId');
  const itemTitle = getRemoteDataString(data, 'itemTitle');

  if (typeof otherUserId !== 'string' || typeof otherName !== 'string') {
    return null;
  }

  return {
    otherUserId,
    otherName,
    itemId,
    itemTitle,
  };
}

function extractNotificationIdentityFromRemoteData(
  data?: FirebaseMessagingTypes.RemoteMessage['data'],
): NotificationIdentity {
  const messageIdRaw = getRemoteDataString(data, 'messageId');
  const eventIdRaw = getRemoteDataString(data, 'eventId');

  const messageId = typeof messageIdRaw === 'string' && messageIdRaw.trim().length > 0
    ? messageIdRaw
    : undefined;
  const eventId = typeof eventIdRaw === 'string' && eventIdRaw.trim().length > 0
    ? eventIdRaw
    : messageId;

  return {messageId, eventId};
}

function getRemoteDataString(
  data: FirebaseMessagingTypes.RemoteMessage['data'] | undefined,
  key: string,
): string | undefined {
  const value = data?.[key];
  return typeof value === 'string' ? value : undefined;
}
