import React, {useEffect, useState} from 'react';
import {View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {rentalsService} from '../../services/rentalsService';
import {Rental} from '../../types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const STATUS_COLORS: Record<string, string> = {
  Pending: '#ff9800',
  Active: '#4caf50',
  Completed: '#9e9e9e',
  Cancelled: '#f44336',
};

export default function MyRentalsScreen() {
  const navigation = useNavigation<NavProp>();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRentals = () => {
    rentalsService.getMyRentals()
      .then(r => setRentals(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadRentals(); }, []);

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
                <Text style={styles.badgeText}>{item.status}</Text>
              </View>
            </View>
            <Text style={styles.dates}>
              {new Date(item.startDate).toLocaleDateString()} → {new Date(item.endDate).toLocaleDateString()}
            </Text>
            <Text style={styles.total}>Total: R$ {item.totalPrice.toFixed(2)}</Text>
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={<Text style={styles.empty}>You have no rentals yet.</Text>}
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
  empty: {textAlign: 'center', marginTop: 40, color: '#888'},
});
