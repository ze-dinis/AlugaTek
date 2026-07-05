import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {itemsService} from '../../services/itemsService';
import {TechItem, Category} from '../../types';
import {resolveApiAssetUrl} from '../../config';
import {i18n} from '../../locales';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const [items, setItems] = useState<TechItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const {data} = await itemsService.getAll({
        categoryId: selectedCategory,
        search: search || undefined,
      });
      setItems(data);
    } catch {
      // silently fail; items will remain as-is
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, search]);

  useEffect(() => {
    itemsService.getCategories().then(r => setCategories(r.data));
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(fetchItems, 300);
    return () => clearTimeout(timer);
  }, [fetchItems]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchItems();
    }, [fetchItems]),
  );

  const renderItem = ({item}: {item: TechItem}) => (
    (() => {
      const imageUri = resolveApiAssetUrl(item.imageUrl);

      return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ItemDetail', {itemId: item.id})}>
      {imageUri ? (
        <Image source={{uri: imageUri}} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.placeholder]}>
          <Text style={styles.placeholderText}>📱</Text>
        </View>
      )}
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardCategory}>{item.categoryName}</Text>
        <Text style={styles.cardRate}>R$ {item.dailyRate.toFixed(2)}/day</Text>
        {item.averageRating && (
          <Text style={styles.rating}>⭐ {item.averageRating.toFixed(1)}</Text>
        )}
      </View>
    </TouchableOpacity>
      );
    })()
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TextInput
          style={styles.searchInput}
          placeholder={i18n.home.searchPlaceholder}
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('CreateItem')}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={categories}
        horizontal
        keyExtractor={c => String(c.id)}
        contentContainerStyle={styles.categoryList}
        renderItem={({item: cat}) => (
          <TouchableOpacity
            style={[styles.chip, selectedCategory === cat.id && styles.chipSelected]}
            onPress={() => setSelectedCategory(selectedCategory === cat.id ? undefined : cat.id)}>
            <Text style={[styles.chipText, selectedCategory === cat.id && styles.chipTextSelected]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <ActivityIndicator style={{flex: 1}} size="large" color="#1a73e8" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchItems();}} />
          }
          ListEmptyComponent={<Text style={styles.empty}>{i18n.home.noItems}</Text>}
        />
      )}}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  header: {flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff'},
  searchInput: {flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15},
  addButton: {backgroundColor: '#1a73e8', width: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center'},
  addButtonText: {color: '#fff', fontSize: 24, lineHeight: 28},
  categoryList: {paddingHorizontal: 12, paddingVertical: 8},
  chip: {borderWidth: 1, borderColor: '#1a73e8', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8},
  chipSelected: {backgroundColor: '#1a73e8'},
  chipText: {color: '#1a73e8', fontSize: 13},
  chipTextSelected: {color: '#fff'},
  grid: {padding: 8},
  card: {flex: 1, margin: 6, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4},
  cardImage: {width: '100%', height: 130},
  placeholder: {backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center'},
  placeholderText: {fontSize: 40},
  cardContent: {padding: 8},
  cardTitle: {fontWeight: '600', fontSize: 14},
  cardCategory: {color: '#888', fontSize: 12, marginTop: 2},
  cardRate: {color: '#1a73e8', fontWeight: '700', marginTop: 4},
  rating: {fontSize: 12, marginTop: 2},
  empty: {textAlign: 'center', marginTop: 40, color: '#888'},
});
