import React, {useEffect, useState, useRef, useMemo} from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Image,
} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {chatService} from '../../services/chatService';
import {itemsService} from '../../services/itemsService';
import {rentalsService} from '../../services/rentalsService';
import {rentalReviewsService} from '../../services/rentalReviewsService';
import {resolveApiAssetUrl} from '../../config';
import {useAuthStore} from '../../store/authStore';
import {Message, RentalReviewEligibility, RentalStatus} from '../../types';
import {i18n} from '../../locales';
import PaymentModal from '../../components/PaymentModal';
import DisputeModal from '../../components/DisputeModal';
import RentalReviewModal from '../../components/RentalReviewModal';
import {payoutPreferenceService} from '../../services/payoutPreferenceService';
import {parsePaymentDestination} from '../../utils/paymentDestinationValidation';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

const PLATFORM_BASE_COMMISSION = 3.0;
const PLATFORM_PERCENTAGE_COMMISSION_RATE = 0.1;
const MAX_CHAT_IMAGES = 5;

type PendingChatImage = {
  uri: string;
  name?: string;
  type?: string;
};

export default function ChatDetailScreen({route, navigation}: Props) {
  const {itemId, itemTitle, otherUserId} = route.params;
  const {user} = useAuthStore();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [requestActionLoading, setRequestActionLoading] = useState<Record<string, boolean>>({});
  const [paymentActionLoading, setPaymentActionLoading] = useState<Record<string, boolean>>({});
  const [returnActionLoading, setReturnActionLoading] = useState<Record<string, boolean>>({});
  const [handledRequests, setHandledRequests] = useState<string[]>([]);
  const [rentalStatuses, setRentalStatuses] = useState<Record<string, RentalStatus>>({});
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
  const [reviewEligibilityByRentalId, setReviewEligibilityByRentalId] = useState<Record<string, RentalReviewEligibility>>({});
  const [reviewTargetRentalId, setReviewTargetRentalId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [pendingImages, setPendingImages] = useState<PendingChatImage[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const sendInFlightRef = useRef(false);

  const latestDisputableRentalId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.rentalId) return message.rentalId;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('ItemDetail', {itemId})}
          style={styles.headerTitleButton}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Text numberOfLines={1} style={styles.headerTitleText}>{itemTitle}</Text>
        </TouchableOpacity>
      ),
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
  }, [latestDisputableRentalId, navigation, itemId, itemTitle, submittingDispute]);

  useEffect(() => {
    const loadMessages = async () => {
      try {
        const {data} = await chatService.getMessages(itemId, otherUserId);
        setMessages(data);
        setLoadError(false);
        setTimeout(() => flatListRef.current?.scrollToEnd({animated: false}), 100);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [itemId, otherUserId]);

  // Rental action buttons must reflect the rental's real status, not just
  // in-session actions. Fetch the status for each incoming request so resolved
  // requests (confirmed, declined, cancelled, expired, returned) don't keep
  // their buttons.
  useEffect(() => {
    const rentalIdsToFetch = Array.from(
      new Set(
        messages
          .filter(
            message =>
              (message.messageType === 'RentalRequest' ||
                message.messageType === 'ReturnRequest') &&
              !!message.rentalId &&
              message.sender.id !== user?.id,
          )
          .map(message => message.rentalId as string),
      ),
    ).filter(rentalId => !(rentalId in rentalStatuses));

    if (rentalIdsToFetch.length === 0) {
      return;
    }

    let cancelled = false;

    (async () => {
      const results = await Promise.all(
        rentalIdsToFetch.map(async rentalId => {
          try {
            const {data} = await rentalsService.getById(rentalId);
            return [rentalId, data.status] as const;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      const resolved = results.filter(
        (entry): entry is readonly [string, RentalStatus] => entry !== null,
      );
      if (resolved.length === 0) {
        return;
      }

      setRentalStatuses(prev => {
        const next = {...prev};
        for (const [rentalId, status] of resolved) {
          next[rentalId] = status;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, user?.id, rentalStatuses]);

  useEffect(() => {
    const rentalIdsToFetch = Array.from(
      new Set(
        messages
          .filter(message => !!message.rentalId)
          .map(message => message.rentalId as string),
      ),
    ).filter(rentalId => !(rentalId in reviewEligibilityByRentalId));

    if (rentalIdsToFetch.length === 0) {
      return;
    }

    let cancelled = false;

    (async () => {
      const responses = await Promise.all(
        rentalIdsToFetch.map(async rentalId => {
          try {
            const {data} = await rentalReviewsService.getEligibility(rentalId);
            return [rentalId, data] as const;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      const resolved = responses.filter(
        (entry): entry is readonly [string, RentalReviewEligibility] => entry !== null,
      );
      if (resolved.length === 0) {
        return;
      }

      setReviewEligibilityByRentalId(prev => {
        const next = {...prev};
        for (const [rentalId, eligibility] of resolved) {
          next[rentalId] = eligibility;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, reviewEligibilityByRentalId]);

  const latestReviewableMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message.rentalId) continue;
      if (reviewEligibilityByRentalId[message.rentalId]?.canReview) return message.id;
    }
    return null;
  }, [messages, reviewEligibilityByRentalId]);

  const latestReviewedMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message.rentalId) continue;
      if (reviewEligibilityByRentalId[message.rentalId]?.hasReviewed) return message.id;
    }
    return null;
  }, [messages, reviewEligibilityByRentalId]);

  const handleSend = async () => {
    if (sendInFlightRef.current) return;

    const messageText = inputText.trim();
    if (!messageText && pendingImages.length === 0) return;

    sendInFlightRef.current = true;
    setInputText('');
    const imagesToUpload = pendingImages;
    setPendingImages([]);
    setSending(true);

    try {
      let imageUrls: string[] = [];
      if (imagesToUpload.length > 0) {
        const uploadRes = await itemsService.uploadImages(imagesToUpload);
        imageUrls = uploadRes.data.imageUrls ?? [];
      }

      const {data} = await chatService.sendMessage(itemId, messageText, otherUserId, imageUrls);
      setMessages(prev => [...prev, data]);
      setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
    } catch {
      setInputText(messageText);
      setPendingImages(imagesToUpload);
      Alert.alert('Erro', 'Não foi possível enviar a mensagem. Verifique a sua ligação e tente novamente.');
    } finally {
      setSending(false);
      sendInFlightRef.current = false;
    }
  };

  const handleChoosePhotos = async () => {
    if (pendingImages.length >= MAX_CHAT_IMAGES) {
      Alert.alert('Erro', `Pode enviar no máximo ${MAX_CHAT_IMAGES} fotos por mensagem.`);
      return;
    }

    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: MAX_CHAT_IMAGES - pendingImages.length,
      quality: 0.9,
    });

    if (result.didCancel || result.errorCode) {
      return;
    }

    const assets = (result.assets ?? []).filter(asset => !!asset.uri);
    if (assets.length === 0) return;

    const remainingSlots = MAX_CHAT_IMAGES - pendingImages.length;
    const nextImages: PendingChatImage[] = assets.slice(0, remainingSlots).map((asset, index) => ({
      uri: asset.uri!,
      name: asset.fileName ?? `chat-${Date.now()}-${index + 1}.jpg`,
      type: asset.type,
    }));

    setPendingImages(prev => [...prev, ...nextImages]);

    if (assets.length > remainingSlots) {
      Alert.alert('Erro', `Pode enviar no máximo ${MAX_CHAT_IMAGES} fotos por mensagem.`);
    }
  };

  const handleRemovePendingImage = (index: number) => {
    setPendingImages(prev => prev.filter((_, imageIndex) => imageIndex !== index));
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
      // A timed-out or dropped response can still have been applied server-side,
      // so only report a failure when the rental is really still pending.
      const appliedStatus = await rentalsService
        .getById(rentalId)
        .then(({data}) => data.status)
        .catch(() => null);

      if (appliedStatus && appliedStatus !== 'Pending') {
        setHandledRequests(prev => [...prev, rentalId]);
        setRentalStatuses(prev => ({...prev, [rentalId]: appliedStatus}));
        Alert.alert('Sucesso', action === 'confirm' ? 'Pedido confirmado.' : 'Pedido cancelado.');
      } else {
        Alert.alert('Erro', 'Não foi possível processar o pedido.');
      }
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
      'Tem a certeza que quer confirmar a devolução deste item? A caução será devolvida ao arrendatário.',
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

  const handleOpenReview = (rentalId: string) => {
    setReviewTargetRentalId(rentalId);
    setReviewRating(5);
    setReviewComment('');
  };

  const handleSubmitReview = async () => {
    if (!reviewTargetRentalId) return;

    setSubmittingReview(true);
    try {
      await rentalReviewsService.create(reviewTargetRentalId, reviewRating, reviewComment.trim());
      setReviewEligibilityByRentalId(prev => ({
        ...prev,
        [reviewTargetRentalId]: {
          ...(prev[reviewTargetRentalId] ?? {rentalId: reviewTargetRentalId}),
          canReview: false,
          hasReviewed: true,
        },
      }));
      setReviewTargetRentalId(null);
      Alert.alert(i18n.common.success, i18n.rentalReview.success);
    } catch {
      Alert.alert(i18n.common.error, i18n.rentalReview.failed);
    } finally {
      setSubmittingReview(false);
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
      && !handledRequests.includes(rentalRequestId)
      && rentalStatuses[rentalRequestId] === 'Pending';
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
      && !confirmedReturns.includes(returnRequestId)
      && rentalStatuses[returnRequestId] === 'ReturnRequested';
    const isReturnActionLoading = returnRequestId ? !!returnActionLoading[returnRequestId] : false;
    const reviewEligibility = item.rentalId ? reviewEligibilityByRentalId[item.rentalId] : undefined;
    const showReviewAction = !!item.rentalId
      && item.id === latestReviewableMessageId
      && !!reviewEligibility?.canReview;
    const showReviewDone = !!item.rentalId
      && item.id === latestReviewedMessageId
      && !!reviewEligibility?.hasReviewed;
    const messageImages = (item.imageUrls ?? [])
      .map(imageUrl => resolveApiAssetUrl(imageUrl) ?? imageUrl)
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl));

    const createdAt = new Date(item.createdAt);
    const createdAtDayKey = createdAt.toDateString();
    const previousMessage = index > 0 ? messages[index - 1] : null;
    const previousDayKey = previousMessage ? new Date(previousMessage.createdAt).toDateString() : null;
    const showDayHeader = index === 0 || createdAtDayKey !== previousDayKey;
    const dayHeaderText = createdAt.toLocaleDateString([], {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const timestampText = createdAt.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <>
        {showDayHeader && (
          <View style={styles.dayHeaderRow}>
            <Text style={styles.dayHeaderText}>{dayHeaderText}</Text>
          </View>
        )}
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
            {messageImages.length > 0 && (
              <View style={styles.messageImageList}>
                {messageImages.map((imageUrl, imageIndex) => (
                  <View key={`${item.id}-${imageIndex}`} style={styles.messageImageWrapper}>
                    <Image source={{uri: imageUrl}} style={styles.messageImage} resizeMode="cover" />
                  </View>
                ))}
              </View>
            )}
            <Text
              style={[
                styles.timestamp,
                isOwn ? styles.ownTimestamp : isSupport ? styles.supportTimestamp : styles.otherTimestamp,
              ]}>
              {timestampText}
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
            {showReviewAction && item.rentalId && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.reviewButton, submittingReview && styles.actionButtonDisabled]}
                  onPress={() => handleOpenReview(item.rentalId!)}
                  disabled={submittingReview}>
                  <Text style={styles.actionButtonText}>
                    {isOwn ? i18n.rentalReview.reviewBuyer : i18n.rentalReview.reviewSeller}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </>
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
            <Text style={styles.emptyText}>
              {loadError
                ? 'Não foi possível carregar as mensagens. Verifique a sua ligação e tente novamente.'
                : i18n.chat.noMessages}
            </Text>
          </View>
        }
      />

      <View style={[styles.inputContainer, {paddingBottom: insets.bottom}]}>
        <Text style={styles.safetyDisclaimer}>
          Mantém-te seguro. Nunca abras links para outros websites e não partilhes contactos nem informação financeira.
        </Text>

        {pendingImages.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingImageList}>
            {pendingImages.map((image, index) => (
              <View key={`${image.uri}-${index}`} style={styles.pendingImageCard}>
                <Image source={{uri: image.uri}} style={styles.pendingImage} resizeMode="cover" />
                <TouchableOpacity style={styles.removePendingImageButton} onPress={() => handleRemovePendingImage(index)}>
                  <Text style={styles.removePendingImageText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.composerRow}>
          <TouchableOpacity
            style={[styles.attachButton, (sending || pendingImages.length >= MAX_CHAT_IMAGES) && styles.attachButtonDisabled]}
            onPress={() => void handleChoosePhotos()}
            disabled={sending || pendingImages.length >= MAX_CHAT_IMAGES}>
            <Text style={styles.attachButtonText}>📎</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder={i18n.chat.writeMessage}
            placeholderTextColor="#8b95a5"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            editable={!sending}
          />

          <TouchableOpacity
            style={[
              styles.sendButton,
              ((!inputText.trim() && pendingImages.length === 0) || sending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={(!inputText.trim() && pendingImages.length === 0) || sending}>
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>{i18n.chat.send}</Text>
            )}
          </TouchableOpacity>
        </View>
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

      <RentalReviewModal
        visible={!!reviewTargetRentalId}
        targetName={reviewTargetRentalId ? reviewEligibilityByRentalId[reviewTargetRentalId]?.reviewee?.name ?? '' : ''}
        rating={reviewRating}
        comment={reviewComment}
        submitting={submittingReview}
        onChangeRating={setReviewRating}
        onChangeComment={setReviewComment}
        onSubmit={() => void handleSubmitReview()}
        onClose={() => setReviewTargetRentalId(null)}
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
  dayHeaderRow: {alignItems: 'center', marginTop: 10, marginBottom: 4},
  dayHeaderText: {
    fontSize: 12,
    color: '#5f6b7a',
    backgroundColor: '#e9eef5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    fontWeight: '600',
  },
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
  messageImageList: {marginTop: 8, gap: 6},
  messageImageWrapper: {borderRadius: 10, overflow: 'hidden'},
  messageImage: {width: 220, height: 180, backgroundColor: '#dfe7f3'},
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
  reviewButton: {backgroundColor: '#2e7d32'},
  actionButtonDisabled: {opacity: 0.6},
  actionButtonText: {color: '#fff', fontSize: 12, fontWeight: '600'},
  reviewDoneText: {marginTop: 8, fontSize: 12, color: '#2e7d32', fontWeight: '600'},
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
  headerTitleButton: {
    maxWidth: 220,
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a73e8',
  },
  inputContainer: {
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  safetyDisclaimer: {
    color: '#5f6b7a',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  pendingImageList: {gap: 8, marginBottom: 10},
  pendingImageCard: {width: 72, height: 72, borderRadius: 12, overflow: 'hidden', position: 'relative'},
  pendingImage: {width: '100%', height: '100%'},
  removePendingImageButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePendingImageText: {color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 12},
  composerRow: {flexDirection: 'row', alignItems: 'flex-end', gap: 8},
  attachButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#e8f0fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachButtonDisabled: {opacity: 0.5},
  attachButtonText: {fontSize: 18},
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    color: '#1f2937',
  },
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
