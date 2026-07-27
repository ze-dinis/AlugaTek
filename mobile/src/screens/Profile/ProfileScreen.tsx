import React, {useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Alert, Image, ScrollView, Modal, TextInput} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {getMessaging, getToken} from '@react-native-firebase/messaging';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {useAuthStore} from '../../store/authStore';
import {pushTokenService} from '../../services/pushTokenService';
import {payoutPreferenceService} from '../../services/payoutPreferenceService';
import {usersService, UserRentalRatingSummary} from '../../services/usersService';
import {UserRentalReviewComment} from '../../types';
import {parsePaymentDestination} from '../../utils/paymentDestinationValidation';
import {i18n} from '../../locales';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const {user, logout} = useAuthStore();
  const navigation = useNavigation<NavigationProp>();
  const [avatarError, setAvatarError] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutDescription, setPayoutDescription] = useState('');
  const [draftPayoutDescription, setDraftPayoutDescription] = useState('');
  const [rentalRating, setRentalRating] = useState<UserRentalRatingSummary | null>(null);
  const [rentalReviews, setRentalReviews] = useState<UserRentalReviewComment[]>([]);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatarUrl]);

  useEffect(() => {
    const loadPayoutDescription = async () => {
      const saved = await payoutPreferenceService.getPaymentDescription();
      setPayoutDescription(saved ?? '');
      setDraftPayoutDescription(saved ?? '');
    };

    loadPayoutDescription();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setRentalRating(null);
      setRentalReviews([]);
      return;
    }

    let cancelled = false;
    Promise.allSettled([
      usersService.getRentalRating(user.id),
      usersService.getRentalReviews(user.id, {limit: 20, sort: 'recent'}),
    ]).then(results => {
      if (cancelled) {
        return;
      }

      const [ratingResult, reviewsResult] = results;

      if (ratingResult.status === 'fulfilled') {
        setRentalRating(ratingResult.value.data);
      } else {
        setRentalRating(null);
      }

      if (reviewsResult.status === 'fulfilled') {
        setRentalReviews(reviewsResult.value.data);
      } else {
        setRentalReviews([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleOpenPayoutModal = () => {
    setDraftPayoutDescription(payoutDescription);
    setShowPayoutModal(true);
  };

  const handleSavePayoutDescription = async () => {
    const trimmed = draftPayoutDescription.trim();
    if (!trimmed) {
      await payoutPreferenceService.setPaymentDescription('');
      setPayoutDescription('');
      setShowPayoutModal(false);
      return;
    }

    const parsed = parsePaymentDestination(trimmed);
    if (!parsed) {
      Alert.alert(i18n.common.error, i18n.profile.invalidIbanMbway);
      return;
    }

    await payoutPreferenceService.setPaymentDescription(parsed.description);
    setPayoutDescription(parsed.description);
    setShowPayoutModal(false);
  };

  const handleLogout = () => {
    Alert.alert(i18n.profile.logout, i18n.common.cancel ? 'Tem a certeza?' : '', [
      {text: i18n.common.cancel, style: 'cancel'},
      {
        text: i18n.profile.signOut,
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await getToken(getMessaging());
            if (token) {
              await pushTokenService.unregisterDeviceToken(token);
            }
          } catch {
            // silently fail
          }

          await logout();
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {user?.avatarUrl && !avatarError ? (
        <Image
          source={{uri: user.avatarUrl}}
          style={styles.avatar}
          onError={() => setAvatarError(true)}
        />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>{user?.name?.[0]?.toUpperCase()}</Text>
        </View>
      )}

      <Text style={styles.name}>{user?.name}</Text>
      <Text style={styles.email}>{user?.email}</Text>
      {user?.phone && <Text style={styles.phone}>{user.phone}</Text>}
      {(rentalRating?.reviewCount ?? user?.rentalReviewCount ?? 0) > 0 ? (
        <Text style={styles.ratingSummary}>
          ⭐ {rentalRating?.averageRating?.toFixed(1) ?? user?.averageRentalRating?.toFixed(1) ?? '0.0'}
          {' · '}
          {rentalRating?.reviewCount ?? user?.rentalReviewCount ?? 0} avaliações
        </Text>
      ) : (
        <Text style={styles.ratingSummaryMuted}>{i18n.profile.noRatings}</Text>
      )}

      <View style={styles.reviewsSection}>
        <Text style={styles.reviewsSectionTitle}>{i18n.profile.reviewCommentsTitle}</Text>
        {rentalReviews.length === 0 ? (
          <Text style={styles.reviewsEmpty}>{i18n.profile.noReviewComments}</Text>
        ) : (
          rentalReviews.map(review => (
            <View key={review.id} style={styles.reviewCard}>
              <Text style={styles.reviewMeta}>
                {'⭐ '}
                {review.rating.toFixed(1)}
                {' · '}
                {review.reviewer.name}
                {' · '}
                {new Date(review.createdAt).toLocaleDateString()}
              </Text>
              <Text style={styles.reviewItem}>Item: {review.itemTitle}</Text>
              {!!review.comment?.trim() && (
                <Text style={styles.reviewComment}>{review.comment}</Text>
              )}
            </View>
          ))
        )}
        {!!user?.id && (
          <TouchableOpacity
            style={styles.viewAllReviewsButton}
            onPress={() => navigation.navigate('UserReviews', {userId: user.id, userName: user.name})}>
            <Text style={styles.viewAllReviewsButtonText}>{i18n.profile.viewAllReviews}</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.myItemsButton} onPress={() => navigation.navigate('MyItems')}>
        <Text style={styles.myItemsText}>{i18n.navigation.myItems}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.myItemsButton} onPress={() => navigation.navigate('MyFavorites')}>
        <Text style={styles.myItemsText}>{i18n.navigation.myFavorites}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.payoutButton} onPress={handleOpenPayoutModal}>
        <Text style={styles.payoutButtonText}>{i18n.profile.addIbanMbway}</Text>
      </TouchableOpacity>
      {payoutDescription ? <Text style={styles.payoutValue}>{payoutDescription}</Text> : null}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>{i18n.profile.signOut}</Text>
      </TouchableOpacity>

      <Modal visible={showPayoutModal} transparent animationType="fade" onRequestClose={() => setShowPayoutModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{i18n.profile.addIbanMbway}</Text>
            <TextInput
              value={draftPayoutDescription}
              onChangeText={setDraftPayoutDescription}
              placeholder={i18n.profile.ibanMbwayPlaceholder}
              placeholderTextColor="#8b95a5"
              style={styles.modalInput}
              autoCapitalize="characters"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowPayoutModal(false)}>
                <Text style={styles.modalCancelText}>{i18n.common.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={handleSavePayoutDescription}>
                <Text style={styles.modalSaveText}>{i18n.common.ok}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {alignItems: 'center', paddingTop: 60, paddingBottom: 40, backgroundColor: '#fff', flexGrow: 1},
  avatar: {width: 96, height: 96, borderRadius: 48},
  avatarPlaceholder: {width: 96, height: 96, borderRadius: 48, backgroundColor: '#1a73e8', justifyContent: 'center', alignItems: 'center'},
  avatarInitial: {color: '#fff', fontSize: 36, fontWeight: 'bold'},
  name: {fontSize: 22, fontWeight: 'bold', marginTop: 16},
  email: {color: '#666', marginTop: 4},
  phone: {color: '#666', marginTop: 2},
  ratingSummary: {color: '#333', marginTop: 6, fontWeight: '600'},
  ratingSummaryMuted: {color: '#666', marginTop: 6, fontWeight: '500'},
  reviewsSection: {width: '90%', marginTop: 18},
  reviewsSectionTitle: {fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 8},
  reviewsEmpty: {color: '#64748b'},
  reviewCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  reviewMeta: {fontSize: 12, color: '#475569', fontWeight: '600'},
  reviewItem: {fontSize: 12, color: '#64748b', marginTop: 4},
  reviewComment: {fontSize: 14, color: '#0f172a', marginTop: 6},
  viewAllReviewsButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#1a73e8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  viewAllReviewsButtonText: {
    color: '#1a73e8',
    fontWeight: '700',
    fontSize: 13,
  },
  myItemsButton: {marginTop: 14, borderWidth: 1, borderColor: '#1a73e8', borderRadius: 8, paddingHorizontal: 32, paddingVertical: 12},
  myItemsText: {color: '#1a73e8', fontWeight: '600', fontSize: 16},
  payoutButton: {marginTop: 14, borderWidth: 1, borderColor: '#00796b', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12},
  payoutButtonText: {color: '#00796b', fontWeight: '600', fontSize: 16},
  payoutValue: {marginTop: 8, color: '#444', maxWidth: '85%', textAlign: 'center'},
  logoutButton: {marginTop: 40, borderWidth: 1, borderColor: '#f44336', borderRadius: 8, paddingHorizontal: 32, paddingVertical: 12},
  logoutText: {color: '#f44336', fontWeight: '600', fontSize: 16},
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
    color: '#1f2937',
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
