import React, {useCallback, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {itemsService} from '../../services/itemsService';
import {rentalsService} from '../../services/rentalsService';
import {TechItem, Review, Rental} from '../../types';
import api from '../../services/api';
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
  const [item, setItem] = useState<TechItem | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [renting, setRenting] = useState(false);
  const [reservedByCurrentUser, setReservedByCurrentUser] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rentalDays, setRentalDays] = useState(3);
  const [reporting, setReporting] = useState(false);

  const loadItemData = useCallback(() => {
    setLoading(true);
    Promise.all([
      itemsService.getById(itemId),
      api.get<Review[]>(`/reviews/item/${itemId}`),
      rentalsService.getMyRentals(),
    ]).then(([itemRes, reviewRes, rentalsRes]) => {
      setItem(itemRes.data);
      setReviews(reviewRes.data);
      const myRentals = rentalsRes.data as Rental[];
      const hasExistingReservation = myRentals.some(r =>
        r.item.id === itemId &&
        r.status === 'Pending',
      );
      setReservedByCurrentUser(hasExistingReservation);
    }).finally(() => setLoading(false));
  }, [itemId]);

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
          text: i18n.common.delete,
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

  if (loading) {
    return <ActivityIndicator style={{flex: 1}} size="large" color="#1a73e8" />;
  }

  if (!item) {
    return <Text style={{textAlign: 'center', marginTop: 40}}>Item not found.</Text>;
  }

  const imageUri = resolveApiAssetUrl(item.imageUrl);
  const isRentalInProgress = !item.isAvailable && !reservedByCurrentUser;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.imageContainer}>
        <SafeImage uri={imageUri} style={styles.image} />
        {isRentalInProgress && <View style={styles.imageGreyOverlay} />}
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>✨ {item.title}</Text>
        <Text style={styles.category}>🏷️ {item.categoryName}</Text>
        <Text style={styles.district}>📍 {item.district}</Text>

        <View style={styles.rateRow}>
          <Text style={styles.rate}>💶 {item.dailyRate.toFixed(2)}€<Text style={styles.rateLabel}>€/dia</Text></Text>
          {item.averageRating && (
            <Text style={styles.rating}>⭐ {item.averageRating.toFixed(1)}</Text>
          )}
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

        {user?.id === item.owner.id ? (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={deleting}>
            {deleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.deleteButtonText}>🗑️ {i18n.itemDetail.deleteItem}</Text>
            )}
          </TouchableOpacity>
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
                navigation.navigate('Chat', {itemId: item.id, itemTitle: item.title})
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

        {reviews.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>⭐ {i18n.itemDetail.reviews} ({reviews.length})</Text>
            {reviews.map(r => (
              <View key={r.id} style={styles.review}>
                <Text style={styles.reviewAuthor}>{r.author.name} · {'⭐'.repeat(r.rating)}</Text>
                <Text style={styles.reviewComment}>{r.comment}</Text>
              </View>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f3f6fb'},
  imageContainer: {position: 'relative'},
  image: {width: '100%', height: 260},
  imageGreyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(120,120,120,0.45)',
  },
  content: {padding: 20, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -18},
  title: {fontSize: 24, fontWeight: 'bold'},
  category: {color: '#888', marginTop: 4},
  district: {color: '#666', marginTop: 2},
  rateRow: {flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12},
  rate: {fontSize: 22, fontWeight: '700', color: '#1a73e8'},
  rateLabel: {fontSize: 14, color: '#888'},
  rating: {fontSize: 16},
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
  buttonRow: {flexDirection: 'row', gap: 12, marginTop: 24},
  halfButton: {flex: 1},
  secondaryActionButton: {padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 24},
  rentButton: {backgroundColor: '#1a73e8', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 24},
  rentButtonText: {color: '#fff', fontWeight: '700', fontSize: 16},
  unavailableButton: {backgroundColor: '#fbc02d'},
  reservedButton: {backgroundColor: '#9e9e9e'},
  unavailableText: {color: '#5d4037', fontWeight: '600', fontSize: 16},
  messageButton: {backgroundColor: '#34a853'},
  messageButtonText: {color: '#fff', fontWeight: '600', fontSize: 16},
  deleteButton: {backgroundColor: '#f44336', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 24},
  deleteButtonText: {color: '#fff', fontWeight: '700', fontSize: 16},
  reportButton: {marginTop: 16, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e57373', alignItems: 'center'},
  reportButtonText: {color: '#c62828', fontWeight: '600', fontSize: 14},
  review: {borderTopWidth: 1, borderColor: '#f0f0f0', paddingTop: 12, marginTop: 12},
  reviewAuthor: {fontWeight: '600', marginBottom: 4},
  reviewComment: {color: '#444'},
});
