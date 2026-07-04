import api from './api';
import {Rental} from '../types';

export const rentalsService = {
  create: (itemId: string, startDate: string, endDate: string) =>
    api.post<Rental>('/rentals', {itemId, startDate, endDate}),

  getById: (id: string) => api.get<Rental>(`/rentals/${id}`),

  getMyRentals: () => api.get<Rental[]>('/rentals/my'),

  cancel: (id: string) => api.patch<Rental>(`/rentals/${id}/cancel`),
};
