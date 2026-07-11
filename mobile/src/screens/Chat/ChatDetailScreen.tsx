import React, {useEffect, useState, useRef, useMemo} from 'react';
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
  Alert,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {chatService} from '../../services/chatService';
import {rentalsService} from '../../services/rentalsService';
import {useAuthStore} from '../../store/authStore';
import {Message} from '../../types';
import {i18n} from '../../locales';
import PaymentModal from '../../components/PaymentModal';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatDetailScreen({route, navigation}: Props) {
  const {otherId, otherName} = route.params;
  const {user} = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [requestActionLoading, setRequestActionLoading] = useState<Record<string, boolean>>({});
  const [paymentActionLoading, setPaymentActionLoading] = useState<Record<string, boolean>>({});
  const [returnActionLoading, setReturnActionLoading] = useState<Record<string, boolean>>({});
  const [handledRequests, setHandledRequests] = useState<string[]>([]);
  const [paidRequests, setPaidRequests] = useState<string[]>([]);
  const [confirmedReturns, setConfirmedReturns] = useState<string[]>([]);
  const [payTarget, setPayTarget] = useState<{rentalId: string; amount: number; caucaoAmount: number} | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const getRentalRequestId = (content: string): string | null => {
    const match = content.match(/pedido de aluguer \(([0-9a-fA-F-]{36})\) para/i);
    return match?.[1] ?? null;
  };

  const getAcceptedRentalId = (content: string): string | null => {
    const match = content.match(/pedido de aluguer \(([0-9a-fA-F-]{36})\) foi confirmado/i);
    return match?.[1] ?? null;
  };

  const getReturnRequestId = (content: string): string | null => {
    const match = content.match(/pedido de devolução \(([0-9a-fA-F-]{36})\)/i);
    return match?.[1] ?? null;
  };

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

  const handleRentalRequestAction = async (rentalId: string, action: 'confirm' | 'decline') => {
    setRequestActionLoading(prev => ({...prev, [rentalId]: true}));
    try {
      if (action === 'confirm') {
        await rentalsService.confirm(rentalId);
      } else {
        await rentalsService.decline(rentalId);
      }
      setHandledRequests(prev => [...prev, rentalId]);
      Alert.alert('Sucesso', action === 'confirm' ? 'Pedido confirmado.' : 'Pedido cancelado.');
    } catch {
      Alert.alert('Erro', 'Não foi possível processar o pedido.');
    } finally {
      setRequestActionLoading(prev => ({...prev, [rentalId]: false}));
    }
  };

  const handlePayRental = async (rentalId: string) => {
    setPaymentActionLoading(prev => ({...prev, [rentalId]: true}));
    try {
      const {data} = await rentalsService.getById(rentalId);
      setPayTarget({rentalId, amount: data.totalPrice, caucaoAmount: data.caucaoAmount});
    } catch {
      Alert.alert('Erro', 'Não foi possível processar o pagamento.');
    } finally {
      setPaymentActionLoading(prev => ({...prev, [rentalId]: false}));
    }
  };

  const handlePaymentSuccess = () => {
    if (payTarget) {
      setPaidRequests(prev => [...prev, payTarget.rentalId]);
    }
    setPayTarget(null);
    Alert.alert('Sucesso', 'Pagamento realizado com sucesso.');
  };

  const handleReturnAction = async (rentalId: string, action: 'confirm' | 'decline') => {
    setReturnActionLoading(prev => ({...prev, [rentalId]: true}));
    try {
      if (action === 'confirm') {
        await rentalsService.confirmReturn(rentalId);
      } else {
        await rentalsService.declineReturn(rentalId);
      }
      setConfirmedReturns(prev => [...prev, rentalId]);
      Alert.alert('Sucesso', action === 'confirm' ? 'Devolução confirmada.' : 'Devolução recusada.');
    } catch {
      Alert.alert('Erro', 'Não foi possível processar a devolução.');
    } finally {
      setReturnActionLoading(prev => ({...prev, [rentalId]: false}));
    }
  };

  const latestRentalRequestMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.sender.id === user?.id) continue;
      const rentalRequestId = getRentalRequestId(message.content);
      const acceptedRentalId = getAcceptedRentalId(message.content);
      if (rentalRequestId && !acceptedRentalId) return message.id;
    }
    return null;
  }, [messages, user?.id]);

  const latestAcceptedRentalMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.sender.id === user?.id) continue;
      if (getAcceptedRentalId(message.content)) return message.id;
    }
    return null;
  }, [messages, user?.id]);

  const latestReturnRequestMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.sender.id === user?.id) continue;
      if (getReturnRequestId(message.content)) return message.id;
    }
    return null;
  }, [messages, user?.id]);

  const renderMessage = ({item, index}: {item: Message; index: number}) => {
    const isOwn = user?.id === item.sender.id;
    const isLastMessage = index === messages.length - 1;
    const rentalRequestId = getRentalRequestId(item.content);
    const acceptedRentalId = getAcceptedRentalId(item.content);
    const returnRequestId = getReturnRequestId(item.content);
    const showActions = isLastMessage
      && !isOwn
      && item.id === latestRentalRequestMessageId
      && !!rentalRequestId
      && !acceptedRentalId
      && !handledRequests.includes(rentalRequestId);
    const isActionLoading = rentalRequestId ? !!requestActionLoading[rentalRequestId] : false;
    const showPayAction = isLastMessage
      && !isOwn
      && item.id === latestAcceptedRentalMessageId
      && !!acceptedRentalId
      && !paidRequests.includes(acceptedRentalId);
    const isPayLoading = acceptedRentalId ? !!paymentActionLoading[acceptedRentalId] : false;
    const showReturnConfirm = isLastMessage
      && !isOwn
      && item.id === latestReturnRequestMessageId
      && !!returnRequestId
      && !confirmedReturns.includes(returnRequestId);
    const isReturnActionLoading = returnRequestId ? !!returnActionLoading[returnRequestId] : false;

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
          {showActions && rentalRequestId && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.confirmButton, isActionLoading && styles.actionButtonDisabled]}
                onPress={() => handleRentalRequestAction(rentalRequestId, 'confirm')}
                disabled={isActionLoading}>
                <Text style={styles.actionButtonText}>Confirmar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton, isActionLoading && styles.actionButtonDisabled]}
                onPress={() => handleRentalRequestAction(rentalRequestId, 'decline')}
                disabled={isActionLoading}>
                <Text style={styles.actionButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          )}
          {showPayAction && acceptedRentalId && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.payButton, isPayLoading && styles.actionButtonDisabled]}
                onPress={() => handlePayRental(acceptedRentalId)}
                disabled={isPayLoading}>
                <Text style={styles.actionButtonText}>Pagar</Text>
              </TouchableOpacity>
            </View>
          )}
          {showReturnConfirm && returnRequestId && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.confirmButton, isReturnActionLoading && styles.actionButtonDisabled]}
                onPress={() => handleReturnAction(returnRequestId, 'confirm')}
                disabled={isReturnActionLoading}>
                <Text style={styles.actionButtonText}>Confirmar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton, isReturnActionLoading && styles.actionButtonDisabled]}
                onPress={() => handleReturnAction(returnRequestId, 'decline')}
                disabled={isReturnActionLoading}>
                <Text style={styles.actionButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          )}
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

      {payTarget && (
        <PaymentModal
          visible={!!payTarget}
          rentalId={payTarget.rentalId}
          amount={payTarget.amount}
          caucaoAmount={payTarget.caucaoAmount}
          onClose={() => setPayTarget(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}
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
  actionRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8},
  actionButton: {borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6},
  confirmButton: {backgroundColor: '#2e7d32'},
  cancelButton: {backgroundColor: '#c62828'},
  payButton: {backgroundColor: '#1565c0'},
  actionButtonDisabled: {opacity: 0.6},
  actionButtonText: {color: '#fff', fontSize: 12, fontWeight: '600'},
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
