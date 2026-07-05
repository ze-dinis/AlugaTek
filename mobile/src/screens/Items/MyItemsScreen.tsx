import React, {useCallback, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
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

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function MyItemsScreen() {
  const navigation = useNavigation<NavProp>();
  const [items, setItems] = useState<TechItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const {data} = await itemsService.getMyItems();
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

  const renderItem = ({item}: {item: TechItem}) => {
    const imageUri = resolveApiAssetUrl(item.imageUrl);
    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardContent}
          onPress={() => navigation.navigate('ItemDetail', {itemId: item.id})}>
          {imageUri ? (
            <Image source={{uri: imageUri}} style={styles.cardImage} />
          ) : (
            <View style={[styles.cardImage, styles.placeholder]}>
              <Text style={styles.placeholderText}>📱</Text>
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.cardCategory}>🏷️ {item.categoryName}</Text>
            <Text style={styles.cardDistrict}>📍 {item.district}</Text>
            <Text style={styles.cardRate}>💶 R$ {item.dailyRate.toFixed(2)}/day</Text>
            <View
              style={[
                styles.badge,
                item.isAvailable ? styles.badgeAvailable : styles.badgeUnavailable,
              ]}>
              <Text style={styles.badgeText}>
                {item.isAvailable ? `✅ ${i18n.myItems.available}` : `⛔ ${i18n.myItems.unavailable}`}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => navigation.navigate('EditItem', {itemId: item.id})}>
          <Text style={styles.editButtonText}>✏️ {i18n.myItems.edit}</Text>
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
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>{i18n.myItems.noItems}</Text>
            <Text style={styles.emptySubtitle}>
              Tap the + button on Home to list your first item.
            </Text>
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
  placeholder: {backgroundColor: '#e8f0fe', justifyContent: 'center', alignItems: 'center'},
  placeholderText: {fontSize: 32},
  cardInfo: {flex: 1, padding: 12, justifyContent: 'space-between'},
  cardTitle: {fontSize: 16, fontWeight: '600', color: '#333'},
  cardCategory: {fontSize: 13, color: '#666', marginTop: 2},
  cardDistrict: {fontSize: 13, color: '#666', marginTop: 2},
  cardRate: {fontSize: 14, color: '#1a73e8', fontWeight: '500', marginTop: 4},
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  badgeAvailable: {backgroundColor: '#e6f4ea'},
  badgeUnavailable: {backgroundColor: '#fce8e6'},
  badgeText: {fontSize: 12, fontWeight: '500', color: '#333'},
  editButton: {backgroundColor: '#34a853', padding: 12, justifyContent: 'center', alignItems: 'center'},
  editButtonText: {color: '#fff', fontWeight: '600', fontSize: 14},
});
