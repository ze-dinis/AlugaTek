import notifee, {AndroidImportance} from '@notifee/react-native';
import {Platform} from 'react-native';

// Use a versioned channel ID — Android locks channel properties (sound, vibration)
// after first creation. Bumping the ID forces a fresh channel with correct settings.
const CHAT_CHANNEL_ID = 'chat-messages-v2';
let isInitialized = false;

export async function initializeNotificationService(): Promise<void> {
  if (Platform.OS !== 'android' || isInitialized) {
    return;
  }

  await notifee.requestPermission();

  await notifee.createChannel({
    id: CHAT_CHANNEL_ID,
    name: 'Chat Messages',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });

  isInitialized = true;
}

interface NewMessageNotificationParams {
  otherId: string;
  otherName: string;
  itemId?: string;
  itemTitle?: string;
  senderName: string;
  messagePreview: string;
  unreadCount: number;
  timestampMs?: number;
  eventId?: string;
}

export async function showNewMessageNotification({
  otherId,
  otherName,
  itemId,
  itemTitle,
  senderName,
  messagePreview,
  unreadCount,
  timestampMs,
  eventId,
}: NewMessageNotificationParams): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await initializeNotificationService();

  const summary = unreadCount > 1 ? `${unreadCount} unread messages` : '1 unread message';
  const notificationTimestamp = Number.isFinite(timestampMs) ? Number(timestampMs) : Date.now();

  await notifee.displayNotification({
    id: eventId,
    title: `Nova mensagem de ${senderName}`,
    body: messagePreview,
    subtitle: summary,
    android: {
      channelId: CHAT_CHANNEL_ID,
      smallIcon: 'ic_launcher',
      pressAction: {id: 'default'},
      importance: AndroidImportance.HIGH,
      showTimestamp: true,
      timestamp: notificationTimestamp,
      onlyAlertOnce: false,
    },
    data: {
      otherId,
      otherName,
      itemId,
      itemTitle,
    },
  });
}
