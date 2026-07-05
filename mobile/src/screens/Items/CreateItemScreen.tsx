import React, {useEffect, useState} from 'react';
import {View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {itemsService} from '../../services/itemsService';
import {Category} from '../../types';
import {useNavigation} from '@react-navigation/native';
import {launchImageLibrary} from 'react-native-image-picker';
import {Picker} from '@react-native-picker/picker';
import {resolveApiAssetUrl} from '../../config';
import {i18n} from '../../locales';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateItem' | 'EditItem'>;

const PORTUGUESE_DISTRICTS = [
  'Aveiro',
  'Beja',
  'Braga',
  'Braganca',
  'Castelo Branco',
  'Coimbra',
  'Evora',
  'Faro',
  'Guarda',
  'Leiria',
  'Lisboa',
  'Portalegre',
  'Porto',
  'Santarem',
  'Setubal',
  'Viana do Castelo',
  'Vila Real',
  'Viseu',
  'Acores',
  'Madeira',
];

export default function CreateItemScreen({route}: Props) {
  const navigation = useNavigation();
  const isEditing = 'params' in route && route.name === 'EditItem';
  const itemId = isEditing ? (route.params as any)?.itemId : null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [district, setDistrict] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [image, setImage] = useState<{uri: string; type?: string; name?: string} | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditing);

  useEffect(() => {
    const loadData = async () => {
      try {
        const categoriesRes = await itemsService.getCategories();
        setCategories(categoriesRes.data);

        if (isEditing && itemId) {
          const itemRes = await itemsService.getById(itemId);
          const item = itemRes.data;
          setTitle(item.title);
          setDescription(item.description);
          setDistrict(item.district ?? '');
          setDailyRate(item.dailyRate.toString());
          setCategoryId(item.categoryName ? categories.find(c => c.name === item.categoryName)?.id || null : null);
          if (item.imageUrl) {
            const resolvedImageUri = resolveApiAssetUrl(item.imageUrl) ?? item.imageUrl;
            setImage({uri: resolvedImageUri});
          }
        }
      } finally {
        setInitialLoading(false);
      }
    };

    loadData();
  }, []);

  const handleChoosePhoto = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.9,
    });

    if (result.didCancel) {
      return;
    }

    if (result.errorCode) {
      Alert.alert(i18n.common.error, result.errorMessage ?? 'Could not pick image.');
      return;
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      Alert.alert(i18n.common.error, 'Invalid image selected.');
      return;
    }

    setImage({
      uri: asset.uri,
      type: asset.type,
      name: asset.fileName,
    });
  };

  const handleSubmit = async () => {
    if (!title || !description || !dailyRate || !categoryId || !district) {
      Alert.alert(i18n.common.error, i18n.item.errorFillFields);
      return;
    }
    if (!isEditing && !image) {
      Alert.alert(i18n.common.error, i18n.item.errorSelectPhoto);
      return;
    }
    const rate = parseFloat(dailyRate);
    if (isNaN(rate) || rate <= 0) {
      Alert.alert(i18n.common.error, 'Enter a valid daily rate.');
      return;
    }
    setLoading(true);
    try {
      if (isEditing && itemId) {
        await itemsService.update(itemId, {
          title,
          description,
          district,
          dailyRate: rate,
          imageUrl: image?.uri,
          isAvailable: true,
        });
        Alert.alert(i18n.common.success, i18n.item.updateSuccess, [
          {text: i18n.common.ok, onPress: () => navigation.goBack()},
        ]);
      } else {
        await itemsService.create({
          title,
          description,
          district,
          dailyRate: rate,
          image: image ?? undefined,
          categoryId,
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>{i18n.item.title} *</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="ex: iPhone 15 Pro" />

      <Text style={styles.label}>{i18n.item.description} *</Text>
      <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription}
        placeholder={i18n.item.description} multiline numberOfLines={4} />

      <Text style={styles.label}>{i18n.item.district} *</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={district}
          onValueChange={(value: string) => setDistrict(value)}>
          <Picker.Item label={i18n.item.selectDistrict} value="" />
          {PORTUGUESE_DISTRICTS.map(d => (
            <Picker.Item key={d} label={d} value={d} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>{i18n.item.dailyRate} *</Text>
      <TextInput style={styles.input} value={dailyRate} onChangeText={setDailyRate}
        placeholder="0.00" keyboardType="decimal-pad" />

      {!isEditing && (
        <>
          <Text style={styles.label}>{i18n.item.selectPhoto} *</Text>
          <TouchableOpacity style={styles.photoButton} onPress={handleChoosePhoto}>
            <Text style={styles.photoButtonText}>{image ? i18n.item.uploadPhoto : i18n.item.selectPhoto}</Text>
          </TouchableOpacity>
          {image ? <Image source={{uri: image.uri}} style={styles.preview} /> : null}
        </>
      )}

      {isEditing && image && (
        <>
          <Text style={styles.label}>{i18n.item.photoPreview}</Text>
          <TouchableOpacity style={styles.photoButton} onPress={handleChoosePhoto}>
            <Text style={styles.photoButtonText}>{i18n.item.uploadPhoto}</Text>
          </TouchableOpacity>
          <Image source={{uri: image.uri}} style={styles.preview} />
        </>
      )}

      <Text style={styles.label}>{i18n.item.category} *</Text>
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
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{isEditing ? i18n.item.updateItem : i18n.item.listItem}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  content: {padding: 20},
  label: {fontWeight: '600', marginBottom: 6, color: '#333'},
  input: {borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 15},
  multiline: {height: 100, textAlignVertical: 'top'},
  categories: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24},
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  chip: {borderWidth: 1, borderColor: '#1a73e8', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6},
  chipSelected: {backgroundColor: '#1a73e8'},
  chipText: {color: '#1a73e8'},
  chipTextSelected: {color: '#fff'},
  photoButton: {
    borderWidth: 1,
    borderColor: '#1a73e8',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  photoButtonText: {color: '#1a73e8', fontWeight: '600'},
  preview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginBottom: 16,
    resizeMode: 'cover',
  },
  button: {backgroundColor: '#1a73e8', padding: 16, borderRadius: 10, alignItems: 'center'},
  buttonText: {color: '#fff', fontWeight: '700', fontSize: 16},
});
