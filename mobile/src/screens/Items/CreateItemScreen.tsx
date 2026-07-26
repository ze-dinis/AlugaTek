import React, {useCallback, useEffect, useState} from 'react';
import {View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {itemsService} from '../../services/itemsService';
import {Category} from '../../types';
import {useNavigation} from '@react-navigation/native';
import {launchImageLibrary} from 'react-native-image-picker';
import {resolveApiAssetUrl} from '../../config';
import {i18n} from '../../locales';
import {PORTUGUESE_DISTRICTS} from '../../constants/districts';
import SafeImage from '../../components/SafeImage';
import {analyticsService} from '../../services/analyticsService';
import BackendCommunicationError from '../../components/BackendCommunicationError';
import CompactDropdown from '../../components/CompactDropdown';
import {isBackendCommunicationError} from '../../utils/networkError';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateItem' | 'EditItem'>;
type ItemImage = {uri: string; type?: string; name?: string; imageUrl?: string};

const MAX_IMAGES = 5;
const DISTRICT_OPTIONS = PORTUGUESE_DISTRICTS.map(district => ({label: district, value: district}));

export default function CreateItemScreen({route}: Props) {
  const navigation = useNavigation();
  const isEditing = 'params' in route && route.name === 'EditItem';
  const itemId = isEditing ? (route.params as any)?.itemId : null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [district, setDistrict] = useState('');
  const [localidade, setLocalidade] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [caucao, setCaucao] = useState('');
  const [images, setImages] = useState<ItemImage[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditing);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const categoriesRes = await itemsService.getCategories();
      const fetchedCategories = categoriesRes.data;
      setCategories(fetchedCategories);

      if (isEditing && itemId) {
        const itemRes = await itemsService.getById(itemId);
        const item = itemRes.data;
        setTitle(item.title);
        setDescription(item.description);
        setDistrict(item.district ?? '');
        setLocalidade(item.localidade ?? '');
        setDailyRate(item.dailyRate.toString());
        setCaucao(item.caucao.toString());
        setCategoryId(item.categoryName ? fetchedCategories.find(c => c.name === item.categoryName)?.id || null : null);
        const backendImageUrls = (item.imageUrls?.length ? item.imageUrls : item.imageUrl ? [item.imageUrl] : [])
          .slice(0, MAX_IMAGES);
        setImages(
          backendImageUrls.map(url => ({
            imageUrl: url,
            uri: resolveApiAssetUrl(url) ?? url,
          })),
        );
      }
      setInitialLoadFailed(false);
    } catch (error) {
      if (isBackendCommunicationError(error)) {
        setInitialLoadFailed(true);
      } else {
        Alert.alert(i18n.common.error, i18n.auth.errorNetworkDetail);
      }
    } finally {
      setInitialLoading(false);
    }
  }, [isEditing, itemId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleChoosePhoto = async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert(i18n.common.error, `Pode carregar no máximo ${MAX_IMAGES} imagens.`);
      return;
    }

    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: MAX_IMAGES,
      quality: 0.9,
    });

    if (result.didCancel) {
      return;
    }

    if (result.errorCode) {
      Alert.alert(i18n.common.error, result.errorMessage ?? 'Could not pick image.');
      return;
    }

    const picked = (result.assets ?? []).filter(asset => !!asset.uri);
    if (picked.length === 0) {
      Alert.alert(i18n.common.error, 'Invalid image selected.');
      return;
    }

    const remainingSlots = MAX_IMAGES - images.length;
    const nextImages: ItemImage[] = picked.slice(0, remainingSlots).map((asset, index) => ({
      uri: asset.uri!,
      type: asset.type,
      name: asset.fileName ?? `item-${Date.now()}-${index + 1}.jpg`,
    }));

    setImages(prev => [...prev, ...nextImages]);

    if (picked.length > remainingSlots) {
      Alert.alert(i18n.common.error, `Apenas ${MAX_IMAGES} imagens são permitidas por anúncio.`);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title || !description || !dailyRate || !categoryId || !district) {
      Alert.alert(i18n.common.error, i18n.item.errorFillFields);
      return;
    }
    if (images.length === 0) {
      Alert.alert(i18n.common.error, i18n.item.errorSelectPhoto);
      return;
    }
    const rate = parseFloat(dailyRate);
    if (isNaN(rate) || rate <= 0) {
      Alert.alert(i18n.common.error, 'Enter a valid daily rate.');
      return;
    }
    const deposit = parseFloat(caucao || '0');
    if (!isEditing && (isNaN(deposit) || deposit <= 0)) {
      Alert.alert(i18n.common.error, i18n.item.errorCaucaoRequired);
      return;
    }
    if (isEditing && (isNaN(deposit) || deposit < 0)) {
      Alert.alert(i18n.common.error, i18n.item.errorCaucaoInvalid);
      return;
    }
    setLoading(true);
    try {
      if (isEditing && itemId) {
        const existingImageUrls = images
          .map(image => image.imageUrl)
          .filter((url): url is string => !!url);
        const newImages = images.filter(image => !image.imageUrl);

        let uploadedImageUrls: string[] = [];
        if (newImages.length > 0) {
          const uploadRes = await itemsService.uploadImages(newImages);
          uploadedImageUrls = uploadRes.data.imageUrls ?? [];
        }

        const imageUrls = [...existingImageUrls, ...uploadedImageUrls].slice(0, MAX_IMAGES);

        await itemsService.update(itemId, {
          title,
          description,
          district,
          localidade,
          dailyRate: rate,
          caucao: deposit,
          imageUrl: imageUrls[0],
          imageUrls,
          isAvailable: true,
        });
        Alert.alert(i18n.common.success, i18n.item.updateSuccess, [
          {text: i18n.common.ok, onPress: () => navigation.goBack()},
        ]);
      } else {
        const {data: createdItem} = await itemsService.create({
          title,
          description,
          district,
          localidade,
          dailyRate: rate,
          caucao: deposit,
          images,
          categoryId,
        });
        void analyticsService.trackItemListed({
          itemId: createdItem.id,
          categoryId,
          district,
          dailyRate: rate,
          caucao: deposit,
          imageCount: images.length,
        });
        Alert.alert(i18n.common.success, i18n.item.creationSuccess, [
          {text: i18n.common.ok, onPress: () => navigation.goBack()},
        ]);
      }
    } catch (e: any) {
      Alert.alert(i18n.common.error, e.response?.data?.message ?? (isEditing ? i18n.item.updateFailed : i18n.item.creationFailed));
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  if (initialLoadFailed) {
    return (
      <BackendCommunicationError
        onRetry={() => {
          setInitialLoading(true);
          setInitialLoadFailed(false);
          void loadData();
        }}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>{isEditing ? '🛠️ Editar anúncio' : '🚀 Novo anúncio'}</Text>

      <Text style={styles.label}>✏️ {i18n.item.title} *</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="ex: iPhone 15 Pro"
        placeholderTextColor="#8b95a5"
      />

      <Text style={styles.label}>📝 {i18n.item.description} *</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder={i18n.item.description}
        placeholderTextColor="#8b95a5"
        multiline
        numberOfLines={4}
      />

      <Text style={styles.label}>📍 {i18n.item.district} *</Text>
      <View style={styles.pickerContainer}>
        <CompactDropdown
          options={[{label: i18n.item.selectDistrict, value: ''}, ...DISTRICT_OPTIONS]}
          selectedValue={district}
          onValueChange={setDistrict}
          placeholder={i18n.item.selectDistrict}
        />
      </View>

      <Text style={styles.label}>📌 {i18n.item.localidade}</Text>
      <TextInput
        style={styles.input}
        value={localidade}
        onChangeText={setLocalidade}
        placeholder={i18n.item.localidade}
        placeholderTextColor="#8b95a5"
      />

      <Text style={styles.label}>💶 {i18n.item.dailyRate} *</Text>
      <TextInput
        style={styles.input}
        value={dailyRate}
        onChangeText={setDailyRate}
        placeholder="0.00"
        placeholderTextColor="#8b95a5"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>🔒 {i18n.item.caucao} {isEditing ? '' : '*'}</Text>
      <TextInput
        style={styles.input}
        value={caucao}
        onChangeText={setCaucao}
        placeholder="0.00"
        placeholderTextColor="#8b95a5"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>🖼️ {i18n.item.selectPhoto} * ({images.length}/{MAX_IMAGES})</Text>
      <TouchableOpacity style={styles.photoButton} onPress={handleChoosePhoto}>
        <Text style={styles.photoButtonText}>📷 {i18n.item.uploadPhoto}</Text>
      </TouchableOpacity>
      <View style={styles.previewGrid}>
        {images.map((image, index) => (
          <View key={`${image.uri}-${index}`} style={styles.previewCard}>
            <SafeImage uri={image.uri} style={styles.preview} />
            <TouchableOpacity
              style={styles.removeImageButton}
              onPress={() => handleRemoveImage(index)}
              disabled={loading}>
              <Text style={styles.removeImageButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <Text style={styles.label}>🏷️ {i18n.item.category} *</Text>
      <View style={styles.categories}>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.chip, categoryId === cat.id && styles.chipSelected]}
            onPress={() => setCategoryId(cat.id)}>
            <Text style={[styles.chipText, categoryId === cat.id && styles.chipTextSelected]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{isEditing ? `💾 ${i18n.item.updateItem}` : `🚀 ${i18n.item.listItem}`}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f3f6fb'},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  content: {padding: 20, paddingBottom: 28},
  heading: {fontSize: 24, fontWeight: '800', color: '#1f2937', marginBottom: 16},
  label: {fontWeight: '600', marginBottom: 6, color: '#333'},
  input: {borderWidth: 1, borderColor: '#d8e0ea', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 15, color: '#1f2937'},
  multiline: {height: 100, textAlignVertical: 'top'},
  categories: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24},
  pickerContainer: {
    marginBottom: 16,
  },
  chip: {borderWidth: 1, borderColor: '#1a73e8', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6},
  chipSelected: {backgroundColor: '#1a73e8'},
  chipText: {color: '#1a73e8'},
  chipTextSelected: {color: '#fff'},
  photoButton: {
    borderWidth: 1,
    borderColor: '#1a73e8',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#eef4ff',
  },
  photoButtonText: {color: '#1a73e8', fontWeight: '600'},
  previewGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16},
  previewCard: {position: 'relative', width: '48%'},
  preview: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  removeImageButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageButtonText: {color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 16},
  button: {backgroundColor: '#1a73e8', padding: 16, borderRadius: 12, alignItems: 'center', shadowColor: '#1a73e8', shadowOpacity: 0.25, shadowRadius: 8},
  buttonText: {color: '#fff', fontWeight: '700', fontSize: 16},
});
