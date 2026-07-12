import api from './api';
import {Rental} from '../types';
import {payoutPreferenceService} from './payoutPreferenceService';

export interface RenewQuote {
  additionalAmount: number;
  platformCommission: number;
  totalCharge: number;
}

export const rentalsService = {
  create: (itemId: string, startDate: string, endDate: string) =>
    api.post<Rental>('/rentals', {itemId, startDate, endDate}),

  getById: (id: string) => api.get<Rental>(`/rentals/${id}`),

  getMyRentals: () => api.get<Rental[]>('/rentals/my'),

  cancel: (id: string) => api.patch<Rental>(`/rentals/${id}/cancel`),

  confirm: (id: string, paymentDescription?: string) =>
    api.patch<Rental>(`/rentals/${id}/confirm`, {paymentDescription}),

  decline: (id: string) => api.patch<Rental>(`/rentals/${id}/decline`),

  // Places a 30-day extended authorization hold on the renter's card via Stripe.
  // `paymentMethodId` is the Stripe PaymentMethod id (pm_...) collected client-side.
  pay: async (id: string, paymentMethodId: string) => {
    const paymentDescription = await payoutPreferenceService.getPaymentDescription();
    return api.patch<Rental>(`/rentals/${id}/pay`, {paymentMethodId, paymentDescription});
  },

  renew: async (id: string, extraDays: number, paymentMethodId: string) => {
    const paymentDescription = await payoutPreferenceService.getPaymentDescription();
    return api.patch<Rental>(`/rentals/${id}/renew`, {extraDays, paymentMethodId, paymentDescription});
  },

  getRenewQuote: (id: string, extraDays: number) =>
    api.get<RenewQuote>(`/rentals/${id}/renew-quote`, {params: {extraDays}}),

  returnRental: (id: string) => api.patch<Rental>(`/rentals/${id}/return`),

  confirmReturn: (id: string) => api.patch<Rental>(`/rentals/${id}/confirm-return`),

  declineReturn: (id: string) => api.patch<Rental>(`/rentals/${id}/decline-return`),
};
