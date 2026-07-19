import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {itemsService} from '../../services/itemsService';
import {rentalsService} from '../../services/rentalsService';
import {TechItem, Category, Rental} from '../../types';
import {resolveApiAssetUrl} from '../../config';
import {i18n} from '../../locales';
import {Picker} from '@react-native-picker/picker';
import {PORTUGUESE_DISTRICTS} from '../../constants/districts';
import SafeImage from '../../components/SafeImage';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAuthStore} from '../../store/authStore';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
const EARNINGS_HINT_KEY_PREFIX = 'earnings_hint_seen';

function normalizeDistrict(value: string | undefined): string {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const user = useAuthStore(s => s.user);
  const [items, setItems] = useState<TechItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>();
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myOpenRentalItemIds, setMyOpenRentalItemIds] = useState<string[]>([]);
  const [showEarningsHint, setShowEarningsHint] = useState(false);

  const getEarningsHintStorageKey = useCallback(() => {
    const userId = user?.id ?? 'anonymous';
    return `${EARNINGS_HINT_KEY_PREFIX}_${userId}`;
  }, [user?.id]);

  const markEarningsHintSeen = useCallback(async () => {
    try {
      await AsyncStorage.setItem(getEarningsHintStorageKey(), '1');
    } catch {
      // silently ignore persistence failures
    }
  }, [getEarningsHintStorageKey]);

  const handleDismissEarningsHint = useCallback(() => {
    setShowEarningsHint(false);
    void markEarningsHintSeen();
  }, [markEarningsHintSeen]);

  const handleOpenEarningsCalculator = useCallback(() => {
    setShowEarningsHint(false);
    void markEarningsHintSeen();
    navigation.navigate('EarningsCalculator');
  }, [markEarningsHintSeen, navigation]);

  const fetchMyRentals = useCallback(async () => {
    try {
      const response = await rentalsService.getMyRentals();
      const openItemIds = (response.data as Rental[])
        .filter(r => ['Pending', 'Active', 'Completed', 'ReturnRequested'].includes(r.status))
        .map(r => r.item.id);
      setMyOpenRentalItemIds(Array.from(new Set(openItemIds)));
    } catch {
      // silently ignore — items will fall back to isAvailable flag
    }
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      const {data} = await itemsService.getAll({
        categoryId: selectedCategory,
        search: search || undefined,
        district: selectedDistrict || undefined,
      });
      const selectedDistrictKey = normalizeDistrict(selectedDistrict);
      const filtered = selectedDistrict
        ? data.filter(item => normalizeDistrict(item.district) === selectedDistrictKey)
        : data;
      setItems(filtered);
    } catch {
      // silently fail; items will remain as-is
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, search, selectedDistrict]);

  const fetchCategories = useCallback(async () => {
    try {
      const {data} = await itemsService.getCategories();
      setCategories(data);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    let isMounted = true;

    const loadEarningsHintVisibility = async () => {
      try {
        const seen = await AsyncStorage.getItem(getEarningsHintStorageKey());
        if (isMounted) {
          setShowEarningsHint(seen !== '1');
        }
      } catch {
        if (isMounted) {
          setShowEarningsHint(true);
        }
      }
    };

    void loadEarningsHintVisibility();

    return () => {
      isMounted = false;
    };
  }, [getEarningsHintStorageKey]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(fetchItems, 300);
    return () => clearTimeout(timer);
  }, [fetchItems]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void fetchItems();
      void fetchMyRentals();
      void fetchCategories();
    }, [fetchItems, fetchMyRentals, fetchCategories]),
  );

  const renderItem = ({item}: {item: TechItem}) => (
    (() => {
      const imageUri = resolveApiAssetUrl(item.imageUrl);
      const isInProgress = !item.isAvailable || myOpenRentalItemIds.includes(item.id);

      return (
    <TouchableOpacity
      style={[styles.card, isInProgress && styles.cardDisabled]}
      onPress={() => navigation.navigate('ItemDetail', {itemId: item.id})}>
      <View style={styles.cardImageContainer}>
        <SafeImage uri={imageUri} style={styles.cardImage} />
        {isInProgress && <View style={styles.cardImageOverlay} />}
      </View>
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, isInProgress && styles.textDisabled]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.cardCategory, isInProgress && styles.textDisabled]}>🏷️ {item.categoryName}</Text>
        <Text style={[styles.cardDistrict, isInProgress && styles.textDisabled]}>📍 {item.district}</Text>
        <Text style={[styles.cardRate, isInProgress && styles.textDisabled]}>💶 {item.dailyRate.toFixed(2)}€/dia</Text>
        {isInProgress && <Text style={styles.inProgressTag}>⏳ {i18n.itemDetail.rentalInProgress}</Text>}
        {item.averageRating && (
          <Text style={[styles.rating, isInProgress && styles.textDisabled]}>⭐ {item.averageRating.toFixed(1)}</Text>
        )}
      </View>
    </TouchableOpacity>
      );
    })()
  );

  return (
    <View style={styles.container}>
      <View style={[styles.hero, {paddingTop: insets.top}]}> 
        <View style={styles.heroTopRow}>
          <Text style={styles.heroTitle}>✨ Descobrir Tecnologia</Text>
          <TouchableOpacity
            style={styles.calculatorButton}
            onPress={handleOpenEarningsCalculator}>
            <Text style={styles.calculatorButtonText}>Calculadora</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.heroSubtitle}>Escolha o equipamento ideal para alugar hoje.</Text>

        {showEarningsHint && (
          <View style={styles.earningsHintCard}>
            <Text style={styles.earningsHintTitle}>Queres ver quanto podes ganhar por mês?</Text>
            <Text style={styles.earningsHintBody}>
              Experimenta a calculadora com exemplos como PS5 e iPhone antes de anunciares.
            </Text>
            <View style={styles.earningsHintActions}>
              <TouchableOpacity style={styles.earningsHintSecondaryButton} onPress={handleDismissEarningsHint}>
                <Text style={styles.earningsHintSecondaryText}>Agora não</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.earningsHintPrimaryButton} onPress={handleOpenEarningsCalculator}>
                <Text style={styles.earningsHintPrimaryText}>Ver calculadora</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔎</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={i18n.home.searchPlaceholder}
          placeholderTextColor="#8b95a5"
          value={search}
          onChangeText={setSearch}
        />
        </View>
      </View>

      <FlatList
        data={categories}
        horizontal
        style={styles.categoryListWrapper}
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

      <View style={styles.districtFilterContainer}>
        <Text style={styles.districtFilterLabel}>📍 {i18n.item.district}</Text>
        <Picker
          style={styles.districtPicker}
          dropdownIconColor="#1f2937"
          selectedValue={selectedDistrict}
          onValueChange={(value: string) => setSelectedDistrict(value)}>
          <Picker.Item label={i18n.home.allDistricts} value="" />
          {PORTUGUESE_DISTRICTS.map(d => (
            <Picker.Item key={d} label={d} value={d} />
          ))}
        </Picker>
      </View>

      {loading ? (
        <ActivityIndicator style={{flex: 1}} size="large" color="#1a73e8" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          numColumns={2}
          contentContainerStyle={items.length === 0 ? styles.gridEmpty : styles.grid}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchItems();}} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>{i18n.home.noItems}</Text>
              <Text style={styles.emptyHint}>Tente mudar a categoria ou o distrito.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f3f6fb'},
  hero: {paddingHorizontal: 14, paddingBottom: 10, backgroundColor: '#f3f6fb'},
  heroTopRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  heroTitle: {fontSize: 24, fontWeight: '800', color: '#1f2937'},
  calculatorButton: {
    backgroundColor: '#e8f0fe',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cfe0ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  calculatorButtonText: {color: '#1a73e8', fontWeight: '700', fontSize: 12},
  heroSubtitle: {fontSize: 13, color: '#526072', marginTop: 4},
  earningsHintCard: {
    marginTop: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8e0ea',
    borderRadius: 12,
    padding: 12,
  },
  earningsHintTitle: {fontSize: 14, fontWeight: '700', color: '#1f2937'},
  earningsHintBody: {fontSize: 12, color: '#5f6b7a', marginTop: 4},
  earningsHintActions: {flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10},
  earningsHintSecondaryButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d8e0ea',
    backgroundColor: '#fff',
  },
  earningsHintSecondaryText: {color: '#5f6b7a', fontWeight: '600', fontSize: 12},
  earningsHintPrimaryButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1a73e8',
  },
  earningsHintPrimaryText: {color: '#fff', fontWeight: '700', fontSize: 12},
  header: {paddingHorizontal: 12, paddingBottom: 10},
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8e0ea',
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  searchIcon: {fontSize: 16, marginRight: 6},
  searchInput: {flex: 1, paddingVertical: 10, fontSize: 15, color: '#1f2937'},
  categoryListWrapper: {maxHeight: 60},
  categoryList: {paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center'},
  chip: {
    borderWidth: 1,
    borderColor: '#1a73e8',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 8,
    minHeight: 40,
    marginVertical: 2,
    justifyContent: 'center',
  },
  chipSelected: {backgroundColor: '#1a73e8'},
  chipText: {color: '#1a73e8', fontSize: 13, lineHeight: 16, includeFontPadding: false},
  chipTextSelected: {color: '#fff'},
  districtFilterContainer: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  districtFilterLabel: {fontSize: 12, color: '#5e6b7a', paddingHorizontal: 12, paddingTop: 8},
  districtPicker: {color: '#1f2937'},
  grid: {padding: 8},
  gridEmpty: {flexGrow: 1, padding: 16, justifyContent: 'center'},
  card: {flex: 1, margin: 6, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 6},
  cardDisabled: {backgroundColor: '#e5e7eb', elevation: 0, shadowOpacity: 0},
  textDisabled: {color: '#9ca3af'},
  cardImageContainer: {position: 'relative'},
  cardImage: {width: '100%', height: 130},
  cardImageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(120,120,120,0.45)',
  },
  cardContent: {padding: 8},
  cardTitle: {fontWeight: '600', fontSize: 14},
  cardCategory: {color: '#888', fontSize: 12, marginTop: 2},
  cardDistrict: {color: '#666', fontSize: 12, marginTop: 2},
  cardRate: {color: '#1a73e8', fontWeight: '700', marginTop: 4},
  inProgressTag: {marginTop: 4, color: '#5f6368', fontWeight: '700', fontSize: 12},
  rating: {fontSize: 12, marginTop: 2},
  emptyState: {alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20},
  emptyIcon: {fontSize: 42, marginBottom: 10},
  emptyTitle: {fontSize: 16, fontWeight: '600', color: '#5b6575'},
  emptyHint: {fontSize: 13, color: '#8b95a5', marginTop: 6, textAlign: 'center'},
});
