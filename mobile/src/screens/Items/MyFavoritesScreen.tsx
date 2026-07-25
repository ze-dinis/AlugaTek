import React, {useCallback, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {itemsService} from '../../services/itemsService';
import {TechItem} from '../../types';
import {resolveApiAssetUrl} from '../../config';
import {i18n} from '../../locales';
import SafeImage from '../../components/SafeImage';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function MyFavoritesScreen() {
  const navigation = useNavigation<NavProp>();
  const [items, setItems] = useState<TechItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const {data} = await itemsService.getFavorites();
      setItems(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchItems();
    }, [fetchItems]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchItems();
  };

  const handleRemoveFavorite = useCallback((itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
    itemsService.removeFavorite(itemId).catch(() => {
      // if the request fails, restore the item on next refresh
      fetchItems();
    });
  }, [fetchItems]);

  const renderItem = ({item}: {item: TechItem}) => {
    const imageUri = resolveApiAssetUrl(item.imageUrl);
    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardContent}
          onPress={() => navigation.navigate('ItemDetail', {itemId: item.id})}>
          <SafeImage uri={imageUri} style={styles.cardImage} />
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.cardCategory}>🏷️ {item.categoryName}</Text>
            <Text style={styles.cardDistrict}>
              📍 {item.localidade ? `${item.localidade}, ${item.district}` : item.district}
            </Text>
            <Text style={styles.cardRate}>💶 {item.dailyRate.toFixed(2)}€/dia</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.removeButton}
          accessibilityRole="button"
          accessibilityLabel={i18n.home.removeFavorite}
          onPress={() => handleRemoveFavorite(item.id)}>
          <Text style={styles.removeButtonIcon}>❤️</Text>
        </TouchableOpacity>
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
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContent}>
            <Text style={styles.emptyIcon}>🤍</Text>
            <Text style={styles.emptyTitle}>{i18n.favorites.noItems}</Text>
            <Text style={styles.emptySubtitle}>{i18n.favorites.subtitle}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f3f6fb'},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  list: {padding: 12},
  emptyContainer: {flex: 1},
  emptyContent: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40},
  emptyIcon: {fontSize: 48, marginBottom: 16},
  emptyTitle: {fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8},
  emptySubtitle: {fontSize: 14, color: '#888', textAlign: 'center'},
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#0f172a',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  cardContent: {flex: 1, flexDirection: 'row'},
  cardImage: {width: 100, height: 100},
  cardInfo: {flex: 1, padding: 12, justifyContent: 'space-between'},
  cardTitle: {fontSize: 16, fontWeight: '600', color: '#333'},
  cardCategory: {fontSize: 13, color: '#666', marginTop: 2},
  cardDistrict: {fontSize: 13, color: '#666', marginTop: 2},
  cardRate: {fontSize: 14, color: '#1a73e8', fontWeight: '500', marginTop: 4},
  removeButton: {width: 56, justifyContent: 'center', alignItems: 'center'},
  removeButtonIcon: {fontSize: 20},
});
