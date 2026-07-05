import React, {useEffect, useState} from 'react';
import {View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image} from 'react-native';
import {itemsService} from '../../services/itemsService';
import {Category} from '../../types';
import {useNavigation} from '@react-navigation/native';
import {launchImageLibrary} from 'react-native-image-picker';

export default function CreateItemScreen() {
  const navigation = useNavigation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [image, setImage] = useState<{uri: string; type?: string; name?: string} | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    itemsService.getCategories().then(r => setCategories(r.data));
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
      Alert.alert('Error', result.errorMessage ?? 'Could not pick image.');
      return;
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      Alert.alert('Error', 'Invalid image selected.');
      return;
    }

    setImage({
      uri: asset.uri,
      type: asset.type,
      name: asset.fileName,
    });
  };

  const handleSubmit = async () => {
    if (!title || !description || !dailyRate || !categoryId) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
    if (!image) {
      Alert.alert('Error', 'Please choose a photo.');
      return;
    }
    const rate = parseFloat(dailyRate);
    if (isNaN(rate) || rate <= 0) {
      Alert.alert('Error', 'Enter a valid daily rate.');
      return;
    }
    setLoading(true);
    try {
      await itemsService.create({
        title,
        description,
        dailyRate: rate,
        image,
        categoryId,
      });
      Alert.alert('Success', 'Item listed successfully!', [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message ?? 'Could not create item.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Title *</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. iPhone 15 Pro" />

      <Text style={styles.label}>Description *</Text>
      <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription}
        placeholder="Describe the item..." multiline numberOfLines={4} />

      <Text style={styles.label}>Daily Rate (R$) *</Text>
      <TextInput style={styles.input} value={dailyRate} onChangeText={setDailyRate}
        placeholder="0.00" keyboardType="decimal-pad" />

      <Text style={styles.label}>Photo Upload *</Text>
      <TouchableOpacity style={styles.photoButton} onPress={handleChoosePhoto}>
        <Text style={styles.photoButtonText}>{image ? 'Change Photo' : 'Choose Photo'}</Text>
      </TouchableOpacity>
      {image ? <Image source={{uri: image.uri}} style={styles.preview} /> : null}

      <Text style={styles.label}>Category *</Text>
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
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>List Item</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  content: {padding: 20},
  label: {fontWeight: '600', marginBottom: 6, color: '#333'},
  input: {borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 15},
  multiline: {height: 100, textAlignVertical: 'top'},
  categories: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24},
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
