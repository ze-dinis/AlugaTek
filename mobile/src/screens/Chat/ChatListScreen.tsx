import React, {useCallback, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {chatService} from '../../services/chatService';
import {Conversation} from '../../types';
import {i18n} from '../../locales';
import {resolveApiAssetUrl} from '../../config';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

function ConversationAvatar({avatarUrl, name}: {avatarUrl?: string; name?: string}) {
  const [avatarError, setAvatarError] = useState(false);

  React.useEffect(() => {
    setAvatarError(false);
  }, [avatarUrl]);

  if (avatarUrl && !avatarError) {
    return (
      <Image
        source={{uri: avatarUrl}}
        style={styles.avatar}
        onError={() => setAvatarError(true)}
      />
    );
  }

  return (
    <View style={styles.avatarPlaceholder}>
      <Text style={styles.avatarInitial}>{name?.[0]?.toUpperCase()}</Text>
    </View>
  );
}

export default function ChatListScreen() {
  const navigation = useNavigation<NavProp>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const {data} = await chatService.getConversations();
      setConversations(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchConversations();
    }, [fetchConversations]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  const renderItem = ({item}: {item: Conversation}) => {
    const timeStr = formatConversationDate(item.lastMessageTime);
    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() =>
          navigation.navigate('Chat', {
            itemId: item.itemId,
            itemTitle: item.itemTitle,
            otherUserId: item.otherUserId,
            otherName: item.otherName,
          })
        }>
        <ConversationAvatar avatarUrl={resolveApiAssetUrl(item.itemImageUrl)} name={item.itemTitle} />
        <View style={styles.content}>
          <Text style={styles.name}>{item.itemTitle}</Text>
          <Text style={styles.subtitle}>{item.otherName}</Text>
          <Text style={styles.lastMessage} numberOfLines={1}>{item.lastMessage}</Text>
        </View>
        <View style={styles.rightSection}>
          <Text style={styles.time}>{timeStr}</Text>
          {item.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={c => `${c.itemId}:${c.otherUserId}`}
        renderItem={renderItem}
        contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : undefined}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContent}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>{i18n.chat.noConversations}</Text>
            <Text style={styles.emptySubtitle}>Start a conversation by viewing an item</Text>
          </View>
        }
      />
    </View>
  );
}

function parseApiDate(value: string): Date {
  const hasTimezone = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(value);
  const normalized = hasTimezone ? value : `${value}Z`;
  return new Date(normalized);
}

function formatConversationDate(value: string): string {
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) {
    return 'Agora';
  }

  if (date.getUTCFullYear() < 2000) {
    return 'Agora';
  }

  return date.toLocaleDateString('pt-PT');
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  emptyContainer: {flex: 1},
  emptyContent: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40},
  emptyIcon: {fontSize: 48, marginBottom: 16},
  emptyTitle: {fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8},
  emptySubtitle: {fontSize: 14, color: '#888', textAlign: 'center'},
  conversationItem: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  avatar: {width: 48, height: 48, borderRadius: 24},
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1a73e8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {color: '#fff', fontSize: 18, fontWeight: 'bold'},
  content: {flex: 1, marginLeft: 12},
  name: {fontSize: 16, fontWeight: '600', color: '#333'},
  subtitle: {fontSize: 13, color: '#666', marginTop: 2},
  lastMessage: {fontSize: 14, color: '#888', marginTop: 2},
  rightSection: {alignItems: 'flex-end'},
  time: {fontSize: 12, color: '#aaa'},
  badge: {
    backgroundColor: '#f44336',
    borderRadius: 10,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '600'},
});
