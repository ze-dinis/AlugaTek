import api from './api';
import {TechItem, Category} from '../types';

export const itemsService = {
  getAll: (params?: {categoryId?: number; search?: string; district?: string; page?: number; pageSize?: number}) =>
    api.get<TechItem[]>('/items', {params}),

  getMyItems: () => api.get<TechItem[]>('/items/my'),

  getById: (id: string) => api.get<TechItem>(`/items/${id}`),

  getCategories: () => api.get<Category[]>('/items/categories'),

  getFavorites: () => api.get<TechItem[]>('/items/favorites'),

  addFavorite: (id: string) => api.post(`/items/${id}/favorite`),

  removeFavorite: (id: string) => api.delete(`/items/${id}/favorite`),

  create: (data: {
    title: string;
    description: string;
    district: string;
    localidade?: string;
    dailyRate: number;
    caucao: number;
    images?: Array<{
      uri: string;
      name?: string;
      type?: string;
    }>;
    categoryId: number;
  }) => {
    const formData = new FormData();
    formData.append('title', data.title);
    formData.append('description', data.description);
    formData.append('district', data.district);
    if (data.localidade?.trim()) {
      formData.append('localidade', data.localidade.trim());
    }
    formData.append('dailyRate', data.dailyRate.toString());
    formData.append('caucao', data.caucao.toString());
    formData.append('categoryId', data.categoryId.toString());

    data.images?.forEach((image, index) => {
      if (!image?.uri) return;

      formData.append('photos', {
        uri: image.uri,
        name: image.name ?? `item-${Date.now()}-${index + 1}.jpg`,
        type: image.type ?? 'image/jpeg',
      } as any);
    });

    return api.post<TechItem>('/items/upload', formData, {
      headers: {'Content-Type': 'multipart/form-data'},
      transformRequest: data => data,
    });
  },

  update: (
    id: string,
    data: {
      title: string;
      description: string;
      district: string;
      localidade?: string;
      dailyRate: number;
      caucao: number;
      imageUrl?: string;
      imageUrls?: string[];
      isAvailable: boolean;
    },
  ) => api.put<TechItem>(`/items/${id}`, data),

  delete: (id: string) => api.delete(`/items/${id}`),

  uploadImage: (photo: {uri: string; name?: string; type?: string}) => {
    const formData = new FormData();
    formData.append('photo', {
      uri: photo.uri,
      name: photo.name ?? `item-${Date.now()}.jpg`,
      type: photo.type ?? 'image/jpeg',
    } as any);
    return api.post<{imageUrl: string}>('/items/upload-image', formData, {
      headers: {'Content-Type': 'multipart/form-data'},
      transformRequest: data => data,
    });
  },

  uploadImages: (photos: Array<{uri: string; name?: string; type?: string}>) => {
    const formData = new FormData();
    photos.forEach((photo, index) => {
      formData.append('photos', {
        uri: photo.uri,
        name: photo.name ?? `item-${Date.now()}-${index + 1}.jpg`,
        type: photo.type ?? 'image/jpeg',
      } as any);
    });

    return api.post<{imageUrls: string[]}>('/items/upload-images', formData, {
      headers: {'Content-Type': 'multipart/form-data'},
      transformRequest: data => data,
    });
  },

  reportUser: (reportedUserId: string, itemId: string, reason: string) =>
    api.post('/reports', {reportedUserId, itemId, reason}),
};
