import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {itemsService} from '../../services/itemsService';
import {rentalsService} from '../../services/rentalsService';
import {TechItem, Review} from '../../types';
import api from '../../services/api';
import {resolveApiAssetUrl} from '../../config';
import {useAuthStore} from '../../store/authStore';

type Props = NativeStackScreenProps<RootStackParamList, 'ItemDetail'>;

export default function ItemDetailScreen({route, navigation}: Props) {
  const {itemId} = route.params;
  const {user} = useAuthStore();
  const [item, setItem] = useState<TechItem | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [renting, setRenting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([
      itemsService.getById(itemId),
      api.get<Review[]>(`/reviews/item/${itemId}`),
    ]).then(([itemRes, reviewRes]) => {
      setItem(itemRes.data);
      setReviews(reviewRes.data);
    }).finally(() => setLoading(false));
  }, [itemId]);

  const handleDelete = () => {
    if (!item) return;
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${item.title}"? This cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await itemsService.delete(item.id);
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Error', e.response?.data?.message ?? 'Could not delete item.');
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
    // Simple: rent for 3 days from today
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 3);

    Alert.alert(
      'Confirm Rental',
      `Rent "${item.title}" for 3 days?\nTotal: R$ ${(item.dailyRate * 3).toFixed(2)}`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Confirm',
          onPress: async () => {
            setRenting(true);
            try {
              await rentalsService.create(
                item.id,
                start.toISOString(),
                end.toISOString(),
              );
              Alert.alert('Success', 'Rental created!');
              setItem(prev => prev ? {...prev, isAvailable: false} : null);
            } catch (e: any) {
              Alert.alert('Error', e.response?.data?.message ?? 'Could not create rental.');
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

  return (
    <ScrollView style={styles.container}>
      {imageUri ? (
        <Image source={{uri: imageUri}} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Text style={{fontSize: 60}}>📱</Text>
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.category}>{item.categoryName}</Text>

        <View style={styles.rateRow}>
          <Text style={styles.rate}>R$ {item.dailyRate.toFixed(2)}<Text style={styles.rateLabel}>/day</Text></Text>
          {item.averageRating && (
            <Text style={styles.rating}>⭐ {item.averageRating.toFixed(1)}</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.description}>{item.description}</Text>

        <Text style={styles.sectionTitle}>Owner</Text>
        <Text style={styles.owner}>{item.owner.name}</Text>

        {user?.id === item.owner.id ? (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={deleting}>
            {deleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.deleteButtonText}>Delete Item</Text>
            )}
          </TouchableOpacity>
        ) : item.isAvailable ? (
          <TouchableOpacity style={styles.rentButton} onPress={handleRent} disabled={renting}>
            {renting ? <ActivityIndicator color="#fff" /> : <Text style={styles.rentButtonText}>Rent Now</Text>}
          </TouchableOpacity>
        ) : (
          <View style={styles.unavailableButton}>
            <Text style={styles.unavailableText}>Currently Unavailable</Text>
          </View>
        )}

        {reviews.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Reviews ({reviews.length})</Text>
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
  container: {flex: 1, backgroundColor: '#fff'},
  image: {width: '100%', height: 260},
  placeholder: {backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center'},
  content: {padding: 20},
  title: {fontSize: 24, fontWeight: 'bold'},
  category: {color: '#888', marginTop: 4},
  rateRow: {flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12},
  rate: {fontSize: 22, fontWeight: '700', color: '#1a73e8'},
  rateLabel: {fontSize: 14, color: '#888'},
  rating: {fontSize: 16},
  sectionTitle: {fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 6},
  description: {color: '#444', lineHeight: 22},
  owner: {color: '#444'},
  rentButton: {backgroundColor: '#1a73e8', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 24},
  rentButtonText: {color: '#fff', fontWeight: '700', fontSize: 16},
  unavailableButton: {backgroundColor: '#e0e0e0', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 24},
  unavailableText: {color: '#888', fontWeight: '600'},
  deleteButton: {backgroundColor: '#f44336', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 24},
  deleteButtonText: {color: '#fff', fontWeight: '700', fontSize: 16},
  review: {borderTopWidth: 1, borderColor: '#f0f0f0', paddingTop: 12, marginTop: 12},
  reviewAuthor: {fontWeight: '600', marginBottom: 4},
  reviewComment: {color: '#444'},
});
