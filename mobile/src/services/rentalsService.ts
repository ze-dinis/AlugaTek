import {AxiosResponse} from 'axios';
import {handleNextAction} from '@stripe/stripe-react-native';
import api from './api';
import {Rental} from '../types';
import {payoutPreferenceService} from './payoutPreferenceService';
import {i18n} from '../locales';

/// Must match Stripe.ReturnUrl on the backend and the StripeProvider urlScheme.
const STRIPE_RETURN_URL = 'alugatek://stripe-redirect';

// The rental price and the caução hold can each trigger their own challenge.
const MAX_AUTHENTICATION_ROUNDS = 2;

interface PaymentActionRequired {
  requiresAction: true;
  rentalId: string;
  stage: 'rental_price' | 'caucao';
  clientSecret: string;
}

type PayResponse = Rental | PaymentActionRequired;

function requiresAction(data: PayResponse): data is PaymentActionRequired {
  return (data as PaymentActionRequired)?.requiresAction === true;
}

/**
 * Drives the 3D Secure challenge loop: the server answers with a client secret whenever the
 * issuer demands authentication, the SDK runs the challenge, and the server then settles.
 */
async function settlePayment(
  rentalId: string,
  initial: AxiosResponse<PayResponse>,
  paymentDescription: string | null,
): Promise<AxiosResponse<Rental>> {
  let response = initial;

  for (let round = 0; round < MAX_AUTHENTICATION_ROUNDS && requiresAction(response.data); round++) {
    const {error} = await handleNextAction(response.data.clientSecret, STRIPE_RETURN_URL);
    if (error) {
      throw new Error(error.message ?? i18n.payment.authenticationFailed);
    }

    response = await api.patch<PayResponse>(`/rentals/${rentalId}/confirm-payment`, {
      paymentDescription,
    });
  }

  if (requiresAction(response.data)) {
    throw new Error(i18n.payment.authenticationFailed);
  }

  return response as AxiosResponse<Rental>;
}

export interface RenewQuote {
  additionalAmount: number;
  platformCommission: number;
  totalCharge: number;
}

export interface OpenDisputePayload {
  reason: string;
  description: string;
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
  // Runs the 3D Secure challenge inline when the issuer demands one.
  pay: async (id: string, paymentMethodId: string) => {
    const paymentDescription = await payoutPreferenceService.getPaymentDescription();
    const response = await api.patch<PayResponse>(`/rentals/${id}/pay`, {
      paymentMethodId,
      paymentDescription,
    });

    return settlePayment(id, response, paymentDescription);
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

  openDispute: (id: string, payload: OpenDisputePayload) =>
    api.post(`/rentals/${id}/dispute`, payload),
};
