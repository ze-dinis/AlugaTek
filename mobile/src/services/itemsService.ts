import api from './api';
import {TechItem, Category} from '../types';

export const itemsService = {
  getAll: (params?: {categoryId?: number; search?: string; district?: string; page?: number}) =>
    api.get<TechItem[]>('/items', {params}),

  getMyItems: () => api.get<TechItem[]>('/items/my'),

  getById: (id: string) => api.get<TechItem>(`/items/${id}`),

  getCategories: () => api.get<Category[]>('/items/categories'),

  create: (data: {
    title: string;
    description: string;
    district: string;
    dailyRate: number;
    image?: {
      uri: string;
      name?: string;
      type?: string;
    };
    categoryId: number;
  }) => {
    const formData = new FormData();
    formData.append('title', data.title);
    formData.append('description', data.description);
    formData.append('district', data.district);
    formData.append('dailyRate', data.dailyRate.toString());
    formData.append('categoryId', data.categoryId.toString());

    if (data.image?.uri) {
      formData.append('photo', {
        uri: data.image.uri,
        name: data.image.name ?? `item-${Date.now()}.jpg`,
        type: data.image.type ?? 'image/jpeg',
      } as any);
    }

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
      dailyRate: number;
      imageUrl?: string;
      isAvailable: boolean;
    },
  ) => api.put<TechItem>(`/items/${id}`, data),

  delete: (id: string) => api.delete(`/items/${id}`),
};
