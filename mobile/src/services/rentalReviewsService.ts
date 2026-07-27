import api from './api';
import {RentalReviewEligibility, RentalUserReview} from '../types';

export const rentalReviewsService = {
  create: (rentalId: string, rating: number, comment: string) =>
    api.post<RentalUserReview>('/rental-reviews', {rentalId, rating, comment}),

  getEligibility: (rentalId: string) =>
    api.get<RentalReviewEligibility>(`/rental-reviews/rental/${rentalId}/eligibility`),
};
