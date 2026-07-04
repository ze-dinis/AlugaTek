import React, {useEffect, useState} from 'react';
import {View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator} from 'react-native';
import {rentalsService} from '../../services/rentalsService';
import {Rental} from '../../types';

const STATUS_COLORS: Record<string, string> = {
  Pending: '#ff9800',
  Active: '#4caf50',
  Completed: '#9e9e9e',
  Cancelled: '#f44336',
};

export default function MyRentalsScreen() {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRentals = () => {
    rentalsService.getMyRentals()
      .then(r => setRentals(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadRentals(); }, []);

  const handleCancel = (id: string) => {
    Alert.alert('Cancel Rental', 'Are you sure you want to cancel this rental?', [
      {text: 'No', style: 'cancel'},
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await rentalsService.cancel(id);
            loadRentals();
          } catch (e: any) {
            Alert.alert('Error', e.response?.data?.message ?? 'Could not cancel.');
          }
        },
      },
    ]);
  };

  if (loading) return <ActivityIndicator style={{flex: 1}} size="large" color="#1a73e8" />;

  return (
    <FlatList
      data={rentals}
      keyExtractor={r => r.id}
      contentContainerStyle={styles.list}
      renderItem={({item}) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.itemTitle}>{item.item.title}</Text>
            <View style={[styles.badge, {backgroundColor: STATUS_COLORS[item.status] ?? '#ccc'}]}>
              <Text style={styles.badgeText}>{item.status}</Text>
            </View>
          </View>
          <Text style={styles.dates}>
            {new Date(item.startDate).toLocaleDateString()} → {new Date(item.endDate).toLocaleDateString()}
          </Text>
          <Text style={styles.total}>Total: R$ {item.totalPrice.toFixed(2)}</Text>
          {(item.status === 'Pending' || item.status === 'Active') && (
            <TouchableOpacity style={styles.cancelButton} onPress={() => handleCancel(item.id)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>You have no rentals yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: {padding: 16},
  card: {backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  itemTitle: {fontWeight: '600', fontSize: 16, flex: 1},
  badge: {borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3},
  badgeText: {color: '#fff', fontSize: 12, fontWeight: '600'},
  dates: {color: '#666', marginTop: 6},
  total: {fontWeight: '700', color: '#1a73e8', marginTop: 4},
  cancelButton: {marginTop: 10, borderWidth: 1, borderColor: '#f44336', borderRadius: 6, padding: 8, alignItems: 'center'},
  cancelText: {color: '#f44336', fontWeight: '600'},
  empty: {textAlign: 'center', marginTop: 40, color: '#888'},
});
