import api from './api';
import {Rental} from '../types';

export const rentalsService = {
  create: (itemId: string, startDate: string, endDate: string) =>
    api.post<Rental>('/rentals', {itemId, startDate, endDate}),

  getById: (id: string) => api.get<Rental>(`/rentals/${id}`),

  getMyRentals: () => api.get<Rental[]>('/rentals/my'),

  cancel: (id: string) => api.patch<Rental>(`/rentals/${id}/cancel`),

  confirm: (id: string) => api.patch<Rental>(`/rentals/${id}/confirm`),

  decline: (id: string) => api.patch<Rental>(`/rentals/${id}/decline`),

  pay: (id: string) => api.patch<Rental>(`/rentals/${id}/pay`),

  returnRental: (id: string) => api.patch<Rental>(`/rentals/${id}/return`),

  confirmReturn: (id: string) => api.patch<Rental>(`/rentals/${id}/confirm-return`),

  declineReturn: (id: string) => api.patch<Rental>(`/rentals/${id}/decline-return`),
};
