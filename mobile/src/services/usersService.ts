import api from './api';
import {UserRentalReviewComment} from '../types';

export interface UserRentalRatingSummary {
  userId: string;
  averageRating?: number | null;
  reviewCount: number;
}

export type RentalReviewsSort = 'recent' | 'highest' | 'lowest';

export const usersService = {
  getRentalRating: (userId: string) =>
    api.get<UserRentalRatingSummary>(`/users/${userId}/rental-rating`),

  getRentalReviews: (
    userId: string,
    options?: {limit?: number; skip?: number; sort?: RentalReviewsSort},
  ) =>
    api.get<UserRentalReviewComment[]>(`/users/${userId}/rental-reviews`, {
      params: options,
    }),
};
