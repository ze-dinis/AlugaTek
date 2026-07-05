import React, {useCallback, useState} from 'react';
import {View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {rentalsService} from '../../services/rentalsService';
import {Rental} from '../../types';
import {i18n} from '../../locales';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const STATUS_COLORS: Record<string, string> = {
  Pending: '#ff9800',
  Active: '#4caf50',
  Completed: '#4caf50',
  ReturnRequested: '#fbc02d',
  Returned: '#9e9e9e',
  Cancelled: '#f44336',
};

const STATUS_LABELS: Record<string, string> = {
  Pending: i18n.myRentals.pending,
  Active: i18n.myRentals.active,
  Completed: i18n.myRentals.completed,
  ReturnRequested: i18n.myRentals.returnRequested,
  Returned: i18n.myRentals.returned,
  Cancelled: i18n.myRentals.cancelled,
};

export default function MyRentalsScreen() {
  const navigation = useNavigation<NavProp>();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [returningRentalId, setReturningRentalId] = useState<string | null>(null);

  const loadRentals = () => {
    rentalsService.getMyRentals()
      .then(r => setRentals(r.data))
      .finally(() => setLoading(false));
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadRentals();
    }, []),
  );

  const handleReturnRental = async (rentalId: string) => {
    setReturningRentalId(rentalId);
    try {
      await rentalsService.returnRental(rentalId);
      loadRentals();
    } catch {
      Alert.alert('Erro', 'Não foi possível devolver o item.');
    } finally {
      setReturningRentalId(null);
    }
  };

  if (loading) return <ActivityIndicator style={{flex: 1}} size="large" color="#1a73e8" />;

  return (
    <FlatList
      data={rentals}
      keyExtractor={r => r.id}
      contentContainerStyle={styles.list}
      renderItem={({item}) => (
        <TouchableOpacity
          style={styles.cardTouchable}
          onPress={() => navigation.navigate('ItemDetail', {itemId: item.item.id})}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.itemTitle}>{item.item.title}</Text>
              <View style={[styles.badge, {backgroundColor: STATUS_COLORS[item.status] ?? '#ccc'}]}>
                <Text style={styles.badgeText}>{STATUS_LABELS[item.status] ?? item.status}</Text>
              </View>
            </View>
            <Text style={styles.dates}>
              {new Date(item.startDate).toLocaleDateString()} → {new Date(item.endDate).toLocaleDateString()}
            </Text>
            <Text style={styles.total}>{i18n.itemDetail.total}: {item.totalPrice.toFixed(2)}€</Text>
            {item.status === 'Completed' && (
              <TouchableOpacity
                style={[styles.returnButton, returningRentalId === item.id && styles.returnButtonDisabled]}
                onPress={() => handleReturnRental(item.id)}
                disabled={returningRentalId === item.id}>
                {returningRentalId === item.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.returnButtonText}>Devolver</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={<Text style={styles.empty}>{i18n.myRentals.noRentals}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: {padding: 16},
  cardTouchable: {marginBottom: 12},
  card: {backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  itemTitle: {fontWeight: '600', fontSize: 16, flex: 1},
  badge: {borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3},
  badgeText: {color: '#fff', fontSize: 12, fontWeight: '600'},
  dates: {color: '#666', marginTop: 6},
  total: {fontWeight: '700', color: '#1a73e8', marginTop: 4},
  returnButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#fbc02d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  returnButtonDisabled: {opacity: 0.7},
  returnButtonText: {color: '#5d4037', fontWeight: '700'},
  empty: {textAlign: 'center', marginTop: 40, color: '#888'},
});
