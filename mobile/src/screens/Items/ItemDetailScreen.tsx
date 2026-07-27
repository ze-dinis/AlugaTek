import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
  Modal,
  Pressable,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {itemsService} from '../../services/itemsService';
import {rentalsService} from '../../services/rentalsService';
import {TechItem, Rental, UserRentalReviewComment} from '../../types';
import {usersService, UserRentalRatingSummary} from '../../services/usersService';
import {resolveApiAssetUrl} from '../../config';
import {useAuthStore} from '../../store/authStore';
import {i18n} from '../../locales';
import SafeImage from '../../components/SafeImage';

type Props = NativeStackScreenProps<RootStackParamList, 'ItemDetail'>;

const PLATFORM_BASE_COMMISSION = 3.0;
const PLATFORM_PERCENTAGE_COMMISSION_RATE = 0.1;

export default function ItemDetailScreen({route, navigation}: Props) {
  const {itemId} = route.params;
  const {user} = useAuthStore();
  const {width, height} = useWindowDimensions();
  const [item, setItem] = useState<TechItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [renting, setRenting] = useState(false);
  const [reservedByCurrentUser, setReservedByCurrentUser] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rentalDays, setRentalDays] = useState(3);
  const [reporting, setReporting] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerActiveImageIndex, setViewerActiveImageIndex] = useState(0);
  const [ownerRentalRating, setOwnerRentalRating] = useState<UserRentalRatingSummary | null>(null);
  const [ownerRentalReviews, setOwnerRentalReviews] = useState<UserRentalReviewComment[]>([]);
  const galleryRef = useRef<FlatList<string> | null>(null);
  const viewerGalleryRef = useRef<FlatList<string> | null>(null);

  const loadItemData = useCallback(async () => {
    setLoading(true);
    try {
      const itemRes = await itemsService.getById(itemId);
      setItem(itemRes.data);

      const [rentalsResult, ownerRatingResult, ownerReviewsResult] = await Promise.allSettled([
        user?.id ? rentalsService.getMyRentals() : Promise.resolve({ data: [] as Rental[] }),
        usersService.getRentalRating(itemRes.data.owner.id),
        usersService.getRentalReviews(itemRes.data.owner.id, {limit: 5, sort: 'recent'}),
      ]);

      if (rentalsResult.status === 'fulfilled') {
        const myRentals = rentalsResult.value.data as Rental[];
        const hasExistingReservation = myRentals.some(r =>
          r.item.id === itemId &&
          r.status === 'Pending',
        );
        setReservedByCurrentUser(hasExistingReservation);
      } else {
        setReservedByCurrentUser(false);
      }

      if (ownerRatingResult.status === 'fulfilled') {
        setOwnerRentalRating(ownerRatingResult.value.data);
      } else {
        setOwnerRentalRating(null);
      }

      if (ownerReviewsResult.status === 'fulfilled') {
        setOwnerRentalReviews(ownerReviewsResult.value.data);
      } else {
        setOwnerRentalReviews([]);
      }
    } catch {
      setItem(null);
      setOwnerRentalRating(null);
      setOwnerRentalReviews([]);
      setReservedByCurrentUser(false);
    } finally {
      setLoading(false);
    }
  }, [itemId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadItemData();
    }, [loadItemData]),
  );

  const handleReport = () => {
    if (!item) return;

    Alert.alert(
      i18n.itemDetail.reportTitle,
      undefined,
      [
        ...i18n.itemDetail.reportReasons.map(reason => ({
          text: reason,
          onPress: async () => {
            setReporting(true);
            try {
              await itemsService.reportUser(item.owner.id, item.id, reason);
              Alert.alert(i18n.common.success, i18n.itemDetail.reportSuccess);
            } catch (e: any) {
              const status = e.response?.status as number | undefined;
              if (status === 409) {
                Alert.alert(i18n.common.error, i18n.itemDetail.reportAlreadySent);
              } else {
                Alert.alert(i18n.common.error, i18n.itemDetail.reportFailed);
              }
            } finally {
              setReporting(false);
            }
          },
        })),
        {text: i18n.common.cancel, style: 'cancel'},
      ],
    );
  };

  const handleDelete = () => {
    if (!item) return;
    Alert.alert(
      i18n.itemDetail.deleteItem,
      `${i18n.itemDetail.deleteConfirm} "${item.title}"? ${i18n.itemDetail.deleteConfirmDetail}`,
      [
        {text: i18n.common.cancel, style: 'cancel'},
        {
          text: i18n.itemDetail.delete,
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await itemsService.delete(item.id);
              navigation.goBack();
            } catch (e: any) {
              Alert.alert(i18n.common.error, e.response?.data?.message ?? i18n.itemDetail.deleteFailed);
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const handleRent = () => {
    if (!item) return;
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + rentalDays);
    const rentPrice = item.dailyRate * rentalDays;
    const platformCommission = PLATFORM_BASE_COMMISSION + (rentPrice * PLATFORM_PERCENTAGE_COMMISSION_RATE);
    const totalPrice = rentPrice + platformCommission;

    Alert.alert(
      i18n.itemDetail.confirmRental,
      `${i18n.itemDetail.rentNow.replace('Alugar Agora', 'Alugar')} "${item.title}" ${i18n.itemDetail.for} ${rentalDays} ${rentalDays === 1 ? i18n.itemDetail.days : i18n.itemDetail.daysPlural}?\n${i18n.itemDetail.rentAmount}: ${rentPrice.toFixed(2)}€\n${i18n.itemDetail.platformCommission}: ${platformCommission.toFixed(2)}€\n${i18n.itemDetail.total}: ${totalPrice.toFixed(2)}€`
        + (item.caucao > 0 ? `\nCau\u00e7\u00e3o: ${item.caucao.toFixed(2)}\u20ac (retida no cart\u00e3o)` : ''),
      [
        {text: i18n.common.cancel, style: 'cancel'},
        {
          text: i18n.common.ok,
          onPress: async () => {
            setRenting(true);
            try {
              await rentalsService.create(
                item.id,
                start.toISOString(),
                end.toISOString(),
              );
              setReservedByCurrentUser(true);
              setItem(prev => prev ? { ...prev, isAvailable: false } : prev);
              Alert.alert(i18n.common.success, i18n.itemDetail.rentalSuccess);
            } catch (e: any) {
              const backendMessage = e.response?.data?.message as string | undefined;
              if (backendMessage?.toLowerCase().includes('confirmed reservation')) {
                setItem(prev => prev ? { ...prev, isAvailable: false } : prev);
              }
              Alert.alert(i18n.common.error, backendMessage ?? i18n.itemDetail.rentalFailed);
            } finally {
              setRenting(false);
            }
          },
        },
      ],
    );
  };

  const galleryImages = (
    item?.imageUrls?.length ? item.imageUrls : item?.imageUrl ? [item.imageUrl] : []
  )
    .map(imageUrl => resolveApiAssetUrl(imageUrl) ?? imageUrl)
    .filter((imageUrl): imageUrl is string => Boolean(imageUrl));

  useEffect(() => {
    if (!viewerVisible || !galleryImages.length) {
      return;
    }

    const timeoutId = setTimeout(() => {
      viewerGalleryRef.current?.scrollToIndex({
        index: viewerActiveImageIndex,
        animated: false,
      });
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [galleryImages.length, viewerActiveImageIndex, viewerVisible]);

  if (loading) {
    return <ActivityIndicator style={{flex: 1}} size="large" color="#1a73e8" />;
  }

  if (!item) {
    return <Text style={{textAlign: 'center', marginTop: 40}}>Item não encontrado.</Text>;
  }

  const isRentalInProgress = !item.isAvailable && !reservedByCurrentUser;

  const createHorizontalScrollHandler = (setIndex: (index: number) => void) => (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const width = event.nativeEvent.layoutMeasurement.width || 1;
    const nextIndex = Math.round(offsetX / width);
    setIndex(nextIndex);
  };

  const handleGalleryScroll = createHorizontalScrollHandler(setActiveImageIndex);
  const handleViewerScroll = createHorizontalScrollHandler(setViewerActiveImageIndex);

  const handleOpenImageViewer = (index: number) => {
    setViewerActiveImageIndex(index);
    setViewerVisible(true);
  };

  return (
    <>
      <ScrollView style={styles.container}>
        {galleryImages.length > 1 && (
          <View style={styles.galleryHeader}>
            <Text style={styles.galleryTitle}>📷 Fotos do artigo</Text>
            <Text style={styles.galleryHint}>Deslize para ver mais</Text>
          </View>
        )}
        <View style={styles.imageContainer}>
          {galleryImages.length > 1 ? (
            <FlatList
              ref={galleryRef}
              data={galleryImages}
              keyExtractor={(uri, index) => `${uri}-${index}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              getItemLayout={(_, index) => ({
                length: width,
                offset: width * index,
                index,
              })}
              onScrollToIndexFailed={({index, averageItemLength}) => {
                const fallbackOffset = (averageItemLength || width) * index;
                galleryRef.current?.scrollToOffset({offset: fallbackOffset, animated: true});
              }}
              onMomentumScrollEnd={handleGalleryScroll}
              renderItem={({item: imageUri, index}) => (
                <TouchableOpacity activeOpacity={0.95} onPress={() => handleOpenImageViewer(index)}>
                  <SafeImage uri={imageUri} style={[styles.image, {width}]} />
                </TouchableOpacity>
              )}
            />
          ) : (
            <TouchableOpacity
              activeOpacity={0.95}
              onPress={() => handleOpenImageViewer(0)}
              disabled={galleryImages.length === 0}>
              <SafeImage uri={galleryImages[0]} style={[styles.image, {width}]} />
            </TouchableOpacity>
          )}
          {isRentalInProgress && <View style={styles.imageGreyOverlay} />}
          {galleryImages.length > 1 && (
            <View style={styles.imageCounter}>
              <Text style={styles.imageCounterText}>{activeImageIndex + 1}/{galleryImages.length}</Text>
            </View>
          )}
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>✨ {item.title}</Text>
          <Text style={styles.category}>🏷️ {item.categoryName}</Text>
          <Text style={styles.district}>
            📍 {item.localidade ? `${item.localidade}, ${item.district}` : item.district}
          </Text>

        <View style={styles.rateRow}>
          <Text style={styles.rate}>💶 {item.dailyRate.toFixed(2)}€<Text style={styles.rateLabel}>€/dia</Text></Text>
        </View>
        {item.caucao > 0 && (
          <Text style={styles.caucaoNote}>🔒 Caução: {item.caucao.toFixed(2)}€ (retida no cartão, devolvida no regresso)</Text>
        )}

        {item.isAvailable && !reservedByCurrentUser && user?.id !== item.owner.id ? (
          <View style={styles.rentalSelector}>
            <Text style={styles.sectionTitle}>🗓️ {i18n.itemDetail.rentalDuration}</Text>
            <View style={styles.daySelector}>
              <TouchableOpacity
                style={styles.dayButton}
                onPress={() => setRentalDays(prev => Math.max(1, prev - 1))}
                disabled={rentalDays <= 1}>
                <Text style={styles.dayButtonText}>−</Text>
              </TouchableOpacity>
              <View style={styles.dayDisplay}>
                <Text style={styles.dayText}>{rentalDays}</Text>
                <Text style={styles.dayLabel}>{rentalDays === 1 ? i18n.itemDetail.days : i18n.itemDetail.daysPlural}</Text>
              </View>
              <TouchableOpacity
                style={styles.dayButton}
                onPress={() => setRentalDays(prev => Math.min(6, prev + 1))}
                disabled={rentalDays >= 6}>
                <Text style={styles.dayButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.totalPrice}>💰 {i18n.itemDetail.rentAmount}: {(item.dailyRate * rentalDays).toFixed(2)}€</Text>
            <Text style={styles.totalPrice}>🧾 {i18n.itemDetail.platformCommission}: {(PLATFORM_BASE_COMMISSION + ((item.dailyRate * rentalDays) * PLATFORM_PERCENTAGE_COMMISSION_RATE)).toFixed(2)}€</Text>
            <Text style={styles.totalPrice}>💳 {i18n.itemDetail.total}: {((item.dailyRate * rentalDays) + PLATFORM_BASE_COMMISSION + ((item.dailyRate * rentalDays) * PLATFORM_PERCENTAGE_COMMISSION_RATE)).toFixed(2)}€</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>📝 {i18n.itemDetail.description}</Text>
        <Text style={styles.description}>{item.description}</Text>

        <Text style={styles.sectionTitle}>👤 {i18n.itemDetail.owner}</Text>
        <Text style={styles.owner}>{item.owner.name}</Text>
        {(ownerRentalRating?.reviewCount ?? item.owner.rentalReviewCount ?? 0) > 0 ? (
          <Text style={styles.ownerRating}>
            ⭐ {ownerRentalRating?.averageRating?.toFixed(1) ?? item.owner.averageRentalRating?.toFixed(1) ?? '0.0'}
            {' · '}
            {ownerRentalRating?.reviewCount ?? item.owner.rentalReviewCount ?? 0} avaliações
          </Text>
        ) : (
          <Text style={styles.ownerRatingMuted}>{i18n.itemDetail.ownerNoRatings}</Text>
        )}

        {ownerRentalReviews.length > 0 && (
          <View style={styles.ownerReviewsContainer}>
            <Text style={styles.ownerReviewsTitle}>{i18n.itemDetail.ownerReviewCommentsTitle}</Text>
            {ownerRentalReviews.map(review => (
              <View key={review.id} style={styles.ownerReviewCard}>
                <Text style={styles.ownerReviewMeta}>
                  {'⭐ '}
                  {review.rating.toFixed(1)}
                  {' · '}
                  {review.reviewer.name}
                  {' · '}
                  {new Date(review.createdAt).toLocaleDateString()}
                </Text>
                {!!review.comment?.trim() && (
                  <Text style={styles.ownerReviewComment}>{review.comment}</Text>
                )}
              </View>
            ))}
            <TouchableOpacity
              style={styles.ownerViewAllReviewsButton}
              onPress={() => navigation.navigate('UserReviews', {userId: item.owner.id, userName: item.owner.name})}>
              <Text style={styles.ownerViewAllReviewsButtonText}>{i18n.itemDetail.ownerViewAllReviews}</Text>
            </TouchableOpacity>
          </View>
        )}

        {user?.id === item.owner.id ? (
          <View style={styles.ownerActions}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => navigation.navigate('EditItem', {itemId: item.id})}
              disabled={deleting}>
              <Text style={styles.editButtonText}>✏️ {i18n.myAdvertisements.edit}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteButton, (deleting || item.canDelete === false) && styles.deleteButtonDisabled]}
              onPress={handleDelete}
              disabled={deleting || item.canDelete === false}>
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.deleteButtonText}>🗑️ {i18n.itemDetail.deleteItem}</Text>
              )}
            </TouchableOpacity>
            {item.canDelete === false && (
              <Text style={styles.deleteBlockedText}>{i18n.itemDetail.deleteBlockedByOngoingRental}</Text>
            )}
          </View>
        ) : (
          <View style={styles.buttonRow}>
            {item.isAvailable && !reservedByCurrentUser ? (
              <TouchableOpacity style={[styles.rentButton, styles.halfButton]} onPress={handleRent} disabled={renting}>
                {renting ? <ActivityIndicator color="#fff" /> : <Text style={styles.rentButtonText}>🚀 {i18n.itemDetail.rentNow}</Text>}
              </TouchableOpacity>
            ) : (
              <View
                style={[
                  reservedByCurrentUser ? styles.reservedButton : styles.unavailableButton,
                  styles.halfButton,
                  styles.secondaryActionButton,
                ]}>
                <Text style={styles.unavailableText}>
                  ✅ {reservedByCurrentUser ? i18n.itemDetail.reserved : i18n.itemDetail.rentalInProgress}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.messageButton, styles.halfButton, styles.secondaryActionButton]}
              onPress={() =>
                navigation.navigate('Chat', {
                  itemId: item.id,
                  itemTitle: item.title,
                  otherUserId: item.owner.id,
                  otherName: item.owner.name,
                })
              }>
              <Text style={styles.messageButtonText}>💬 {i18n.itemDetail.message}</Text>
            </TouchableOpacity>
          </View>
        )}

        {user?.id !== item.owner.id && (
          <TouchableOpacity
            style={styles.reportButton}
            onPress={handleReport}
            disabled={reporting}>
            <Text style={styles.reportButtonText}>🚩 {i18n.itemDetail.reportUser}</Text>
          </TouchableOpacity>
        )}

        </View>
      </ScrollView>

      <Modal
        visible={viewerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerVisible(false)}>
        <View style={styles.viewerBackdrop}>
          <Pressable style={styles.viewerCloseButton} onPress={() => setViewerVisible(false)}>
            <Text style={styles.viewerCloseButtonText}>✕</Text>
          </Pressable>
          <FlatList
            ref={viewerGalleryRef}
            data={galleryImages}
            keyExtractor={(uri, index) => `viewer-${uri}-${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            initialScrollIndex={viewerActiveImageIndex}
            onScrollToIndexFailed={({index, averageItemLength}) => {
              const fallbackOffset = (averageItemLength || width) * index;
              viewerGalleryRef.current?.scrollToOffset({offset: fallbackOffset, animated: true});
            }}
            onMomentumScrollEnd={handleViewerScroll}
            renderItem={({item: imageUri}) => (
              <View style={[styles.viewerImageContainer, {width, height}]}>
                <SafeImage uri={imageUri} style={styles.viewerImage} resizeMode="contain" />
              </View>
            )}
          />
          {galleryImages.length > 1 && (
            <View style={styles.viewerCounter}>
              <Text style={styles.viewerCounterText}>
                {viewerActiveImageIndex + 1}/{galleryImages.length}
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f3f6fb'},
  galleryHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#f3f6fb',
  },
  galleryTitle: {fontSize: 16, fontWeight: '800', color: '#1f2937'},
  galleryHint: {fontSize: 12, color: '#64748b', marginTop: 2},
  imageContainer: {
    position: 'relative',
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  image: {height: 270},
  imageGreyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(120,120,120,0.45)',
  },
  imageCounter: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(15,23,42,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  imageCounterText: {color: '#fff', fontSize: 12, fontWeight: '700'},
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  viewerCloseButton: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCloseButtonText: {color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 24},
  viewerImageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerCounter: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.72)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  viewerCounterText: {color: '#fff', fontSize: 13, fontWeight: '700'},
  content: {padding: 20, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -18},
  title: {fontSize: 24, fontWeight: 'bold'},
  category: {color: '#888', marginTop: 4},
  district: {color: '#666', marginTop: 2},
  rateRow: {flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12},
  rate: {fontSize: 22, fontWeight: '700', color: '#1a73e8'},
  rateLabel: {fontSize: 14, color: '#888'},
  caucaoNote: {fontSize: 13, color: '#555', marginTop: 6, fontStyle: 'italic'},
  rentalSelector: {marginTop: 20},
  daySelector: {flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12},
  dayButton: {width: 44, height: 44, borderRadius: 8, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center'},
  dayButtonText: {fontSize: 24, fontWeight: 'bold', color: '#1a73e8'},
  dayDisplay: {flex: 1, alignItems: 'center'},
  dayText: {fontSize: 20, fontWeight: 'bold'},
  dayLabel: {fontSize: 12, color: '#888'},
  totalPrice: {fontSize: 16, fontWeight: '600', color: '#1a73e8', textAlign: 'center'},
  sectionTitle: {fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 6},
  description: {color: '#444', lineHeight: 22},
  owner: {color: '#444'},
  ownerRating: {color: '#475569', marginBottom: 10, fontWeight: '600'},
  ownerRatingMuted: {color: '#64748b', marginBottom: 10},
  ownerReviewsContainer: {marginBottom: 10},
  ownerReviewsTitle: {fontSize: 14, fontWeight: '700', color: '#1f2937', marginBottom: 8},
  ownerReviewCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#f8fafc',
    marginBottom: 8,
  },
  ownerReviewMeta: {fontSize: 12, color: '#475569', fontWeight: '600'},
  ownerReviewComment: {fontSize: 14, color: '#0f172a', marginTop: 6},
  ownerViewAllReviewsButton: {
    marginTop: 2,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#1a73e8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ownerViewAllReviewsButtonText: {color: '#1a73e8', fontWeight: '700', fontSize: 13},
  buttonRow: {flexDirection: 'row', gap: 12, marginTop: 24},
  halfButton: {flex: 1},
  secondaryActionButton: {
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 56,
  },
  rentButton: {
    backgroundColor: '#1a73e8',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 56,
  },
  rentButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  unavailableButton: {backgroundColor: '#fbc02d'},
  reservedButton: {backgroundColor: '#9e9e9e'},
  unavailableText: {
    color: '#5d4037',
    fontWeight: '600',
    fontSize: 16,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  messageButton: {backgroundColor: '#34a853'},
  messageButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  ownerActions: {marginTop: 24, gap: 10},
  editButton: {backgroundColor: '#34a853', padding: 16, borderRadius: 10, alignItems: 'center'},
  editButtonText: {color: '#fff', fontWeight: '700', fontSize: 16},
  deleteButton: {backgroundColor: '#f44336', padding: 16, borderRadius: 10, alignItems: 'center'},
  deleteButtonDisabled: {opacity: 0.6},
  deleteButtonText: {color: '#fff', fontWeight: '700', fontSize: 16},
  deleteBlockedText: {fontSize: 12, color: '#b91c1c', fontWeight: '600'},
  reportButton: {marginTop: 16, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e57373', alignItems: 'center'},
  reportButtonText: {color: '#c62828', fontWeight: '600', fontSize: 14},
});
