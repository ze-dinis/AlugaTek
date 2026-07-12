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
  Modal,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {chatService} from '../../services/chatService';
import {rentalsService} from '../../services/rentalsService';
import {useAuthStore} from '../../store/authStore';
import {Message} from '../../types';
import {i18n} from '../../locales';
import PaymentModal from '../../components/PaymentModal';
import DisputeModal from '../../components/DisputeModal';
import {payoutPreferenceService} from '../../services/payoutPreferenceService';
import {parsePaymentDestination} from '../../utils/paymentDestinationValidation';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

const PLATFORM_BASE_COMMISSION = 3.0;
const PLATFORM_PERCENTAGE_COMMISSION_RATE = 0.1;

export default function ChatDetailScreen({route, navigation}: Props) {
  const {itemId, itemTitle} = route.params;
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
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [draftPayoutDescription, setDraftPayoutDescription] = useState('');
  const [pendingConfirmRentalId, setPendingConfirmRentalId] = useState<string | null>(null);
  const [disputeRentalId, setDisputeRentalId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeDescription, setDisputeDescription] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const latestDisputableRentalId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.rentalId) return message.rentalId;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    navigation.setOptions({
      title: itemTitle,
      headerRight: () =>
        latestDisputableRentalId ? (
          <TouchableOpacity
            style={[styles.headerActionButton, submittingDispute && styles.actionButtonDisabled]}
            onPress={() => handleOpenDispute(latestDisputableRentalId)}
            disabled={submittingDispute}>
            <Text style={styles.headerActionText}>Abrir disputa</Text>
          </TouchableOpacity>
        ) : null,
    });
  }, [latestDisputableRentalId, navigation, itemTitle, submittingDispute]);

  useEffect(() => {
    const loadMessages = async () => {
      try {
        const {data} = await chatService.getMessages(itemId);
        setMessages(data);
        setTimeout(() => flatListRef.current?.scrollToEnd({animated: false}), 100);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [itemId]);

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const messageText = inputText;
    setInputText('');
    setSending(true);

    try {
      const {data} = await chatService.sendMessage(itemId, messageText);
      setMessages(prev => [...prev, data]);
      setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
    } catch {
      setInputText(messageText);
    } finally {
      setSending(false);
    }
  };

  const handleRentalRequestAction = async (rentalId: string, action: 'confirm' | 'decline') => {
    if (action === 'confirm') {
      const savedPayoutDestination = await payoutPreferenceService.getPaymentDescription();
      const parsedSavedDestination = savedPayoutDestination
        ? parsePaymentDestination(savedPayoutDestination)
        : null;
      if (!parsedSavedDestination) {
        setPendingConfirmRentalId(rentalId);
        setDraftPayoutDescription(savedPayoutDestination ?? '');
        setShowPayoutModal(true);
        return;
      }
    }

    setRequestActionLoading(prev => ({...prev, [rentalId]: true}));
    try {
      if (action === 'confirm') {
        const savedPayoutDestination = await payoutPreferenceService.getPaymentDescription();
        const parsedSavedDestination = savedPayoutDestination
          ? parsePaymentDestination(savedPayoutDestination)
          : null;
        await rentalsService.confirm(rentalId, parsedSavedDestination?.description);
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

  const handleSavePayoutAndConfirm = async () => {
    const trimmed = draftPayoutDescription.trim();
    const parsed = parsePaymentDestination(trimmed);
    if (!parsed) {
      Alert.alert(i18n.common.error, i18n.profile.invalidIbanMbway);
      return;
    }

    await payoutPreferenceService.setPaymentDescription(parsed.description);
    setShowPayoutModal(false);

    if (pendingConfirmRentalId) {
      const rentalId = pendingConfirmRentalId;
      setPendingConfirmRentalId(null);
      await handleRentalRequestAction(rentalId, 'confirm');
    }
  };

  const handlePayRental = async (rentalId: string) => {
    setPaymentActionLoading(prev => ({...prev, [rentalId]: true}));
    try {
      const {data} = await rentalsService.getById(rentalId);
      const platformCommission = PLATFORM_BASE_COMMISSION + (data.totalPrice * PLATFORM_PERCENTAGE_COMMISSION_RATE);
      const totalChargeAmount = data.totalPrice + platformCommission;
      setPayTarget({rentalId, amount: totalChargeAmount, caucaoAmount: data.caucaoAmount});
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

  const handleConfirmReturnWithPrompt = (rentalId: string) => {
    Alert.alert(
      'Confirmar devolução',
      'Tem a certeza que quer confirmar a devolução deste item?',
      [
        {text: 'Cancelar', style: 'cancel'},
        {
          text: 'Confirmar',
          style: 'destructive',
          onPress: () => {
            void handleReturnAction(rentalId, 'confirm');
          },
        },
      ],
    );
  };

  const handleOpenDispute = (rentalId: string) => {
    setDisputeRentalId(rentalId);
    setDisputeReason('');
    setDisputeDescription('');
  };

  const handleSubmitDispute = async () => {
    if (!disputeRentalId) return;
    if (!disputeReason.trim() || !disputeDescription.trim()) {
      Alert.alert('Erro', 'Preencha motivo e descrição da disputa.');
      return;
    }

    setSubmittingDispute(true);
    try {
      await rentalsService.openDispute(disputeRentalId, {
        reason: disputeReason.trim(),
        description: disputeDescription.trim(),
      });

      setDisputeRentalId(null);
      Alert.alert('Sucesso', 'Disputa enviada para análise da equipa de suporte.');
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir a disputa.');
    } finally {
      setSubmittingDispute(false);
    }
  };

  const latestAcceptedRentalMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.sender.id === user?.id) continue;
      if (message.messageType === 'RentalConfirmed') return message.id;
    }
    return null;
  }, [messages, user?.id]);

  const latestReturnRequestMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.sender.id === user?.id) continue;
      if (message.messageType === 'ReturnRequest') return message.id;
    }
    return null;
  }, [messages, user?.id]);

  const renderMessage = ({item, index}: {item: Message; index: number}) => {
    const isOwn = user?.id === item.sender.id;
    const isSupport = item.messageType === 'SupportReply' || item.messageType === 'SupportResolution';
    const rentalRequestId = item.messageType === 'RentalRequest' ? item.rentalId : null;
    const acceptedRentalId = item.messageType === 'RentalConfirmed' ? item.rentalId : null;
    const returnRequestId = item.messageType === 'ReturnRequest' ? item.rentalId : null;
    const showActions = !isOwn
      && !!rentalRequestId
      && !handledRequests.includes(rentalRequestId);
    const isActionLoading = rentalRequestId ? !!requestActionLoading[rentalRequestId] : false;
    const isLastMessage = index === messages.length - 1;
    const showPayAction = isLastMessage
      && !isOwn
      && item.id === latestAcceptedRentalMessageId
      && !!acceptedRentalId
      && !paidRequests.includes(acceptedRentalId);
    const isPayLoading = acceptedRentalId ? !!paymentActionLoading[acceptedRentalId] : false;
    const showReturnConfirm = !isOwn
      && item.id === latestReturnRequestMessageId
      && !!returnRequestId
      && !confirmedReturns.includes(returnRequestId);
    const isReturnActionLoading = returnRequestId ? !!returnActionLoading[returnRequestId] : false;

    return (
      <View style={[styles.messageRow, isOwn ? styles.ownMessageRow : styles.otherMessageRow]}>
        <View
          style={[
            styles.messageBubble,
            isOwn ? styles.ownBubble : isSupport ? styles.supportBubble : styles.otherBubble,
          ]}>
          {isSupport && (
            <Text style={styles.supportLabel}>Suporte</Text>
          )}
          <Text style={[styles.messageText, isOwn ? styles.ownText : isSupport ? styles.supportText : styles.otherText]}>
            {item.content}
          </Text>
          <Text
            style={[
              styles.timestamp,
              isOwn ? styles.ownTimestamp : isSupport ? styles.supportTimestamp : styles.otherTimestamp,
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
                onPress={() => handleConfirmReturnWithPrompt(returnRequestId)}
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

      <DisputeModal
        visible={!!disputeRentalId}
        reason={disputeReason}
        description={disputeDescription}
        submitting={submittingDispute}
        onChangeReason={setDisputeReason}
        onChangeDescription={setDisputeDescription}
        onSubmit={() => void handleSubmitDispute()}
        onClose={() => setDisputeRentalId(null)}
      />

      <Modal
        visible={showPayoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowPayoutModal(false);
          setPendingConfirmRentalId(null);
        }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{i18n.profile.addIbanMbway}</Text>
            <TextInput
              value={draftPayoutDescription}
              onChangeText={setDraftPayoutDescription}
              placeholder={i18n.profile.ibanMbwayPlaceholder}
              style={styles.modalInput}
              autoCapitalize="characters"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowPayoutModal(false);
                  setPendingConfirmRentalId(null);
                }}>
                <Text style={styles.modalCancelText}>{i18n.common.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={handleSavePayoutAndConfirm}>
                <Text style={styles.modalSaveText}>{i18n.common.ok}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  supportBubble: {backgroundColor: '#2e7d32'},
  messageText: {fontSize: 15},
  ownText: {color: '#fff'},
  otherText: {color: '#333'},
  supportText: {color: '#fff'},
  supportLabel: {fontSize: 11, fontWeight: '700', color: '#a5d6a7', marginBottom: 2},
  timestamp: {fontSize: 11, marginTop: 4},
  ownTimestamp: {color: '#b3d9ff'},
  otherTimestamp: {color: '#999'},
  supportTimestamp: {color: '#a5d6a7'},
  actionRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8},
  actionButton: {borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6},
  confirmButton: {backgroundColor: '#2e7d32'},
  cancelButton: {backgroundColor: '#c62828'},
  payButton: {backgroundColor: '#1565c0'},
  actionButtonDisabled: {opacity: 0.6},
  actionButtonText: {color: '#fff', fontSize: 12, fontWeight: '600'},
  headerActionButton: {
    backgroundColor: '#d84315',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  headerActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalCancelText: {
    color: '#666',
    fontWeight: '600',
  },
  modalSaveButton: {
    backgroundColor: '#00796b',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modalSaveText: {
    color: '#fff',
    fontWeight: '700',
  },
});
