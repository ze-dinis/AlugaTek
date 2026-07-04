import api from './api';
import {TechItem, Category} from '../types';

export const itemsService = {
  getAll: (params?: {categoryId?: number; search?: string; page?: number}) =>
    api.get<TechItem[]>('/items', {params}),

  getById: (id: string) => api.get<TechItem>(`/items/${id}`),

  getCategories: () => api.get<Category[]>('/items/categories'),

  create: (data: {
    title: string;
    description: string;
    dailyRate: number;
    imageUrl?: string;
    categoryId: number;
  }) => api.post<TechItem>('/items', data),

  update: (
    id: string,
    data: {
      title: string;
      description: string;
      dailyRate: number;
      imageUrl?: string;
      isAvailable: boolean;
    },
  ) => api.put<TechItem>(`/items/${id}`, data),

  delete: (id: string) => api.delete(`/items/${id}`),
};
