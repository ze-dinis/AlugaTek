import React, {useEffect, useState, useRef} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {chatService} from '../../services/chatService';
import {useAuthStore} from '../../store/authStore';
import {Message} from '../../types';
import {i18n} from '../../locales';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatDetailScreen({route, navigation}: Props) {
  const {otherId, otherName} = route.params;
  const {user} = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    navigation.setOptions({title: otherName});
  }, [otherName, navigation]);

  useEffect(() => {
    const loadMessages = async () => {
      try {
        const {data} = await chatService.getMessages(otherId);
        setMessages(data);
        setTimeout(() => flatListRef.current?.scrollToEnd({animated: false}), 100);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [otherId]);

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const messageText = inputText;
    setInputText('');
    setSending(true);

    try {
      const {data} = await chatService.sendMessage(otherId, messageText);
      setMessages(prev => [...prev, data]);
      setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
    } catch {
      setInputText(messageText);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({item}: {item: Message}) => {
    const isOwn = user?.id === item.sender.id;
    return (
      <View style={[styles.messageRow, isOwn ? styles.ownMessageRow : styles.otherMessageRow]}>
        <View
          style={[
            styles.messageBubble,
            isOwn ? styles.ownBubble : styles.otherBubble,
          ]}>
          <Text style={[styles.messageText, isOwn ? styles.ownText : styles.otherText]}>
            {item.content}
          </Text>
          <Text
            style={[
              styles.timestamp,
              isOwn ? styles.ownTimestamp : styles.otherTimestamp,
            ]}>
            {new Date(item.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onEndReached={() => flatListRef.current?.scrollToEnd()}
        ListEmptyComponent={
          <View style={styles.emptyContent}>
            <Text style={styles.emptyText}>{i18n.chat.noMessages}</Text>
          </View>
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={i18n.chat.writeMessage}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}>
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>{i18n.chat.send}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  messageList: {paddingVertical: 12},
  emptyContent: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  emptyText: {color: '#aaa', fontSize: 14},
  messageRow: {marginVertical: 4, paddingHorizontal: 12},
  ownMessageRow: {alignItems: 'flex-end'},
  otherMessageRow: {alignItems: 'flex-start'},
  messageBubble: {maxWidth: '75%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12},
  ownBubble: {backgroundColor: '#1a73e8'},
  otherBubble: {backgroundColor: '#e0e0e0'},
  messageText: {fontSize: 15},
  ownText: {color: '#fff'},
  otherText: {color: '#333'},
  timestamp: {fontSize: 11, marginTop: 4},
  ownTimestamp: {color: '#b3d9ff'},
  otherTimestamp: {color: '#999'},
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {flex: 1, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, maxHeight: 100},
  sendButton: {
    backgroundColor: '#1a73e8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {backgroundColor: '#ccc'},
  sendButtonText: {color: '#fff', fontWeight: '600', fontSize: 14},
});
