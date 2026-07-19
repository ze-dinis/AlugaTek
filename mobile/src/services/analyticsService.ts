import analytics from '@react-native-firebase/analytics';
import {Rental} from '../types';

type ItemListedPayload = {
  itemId?: string;
  categoryId: number;
  district: string;
  dailyRate: number;
  caucao: number;
  imageCount: number;
};

class AnalyticsService {
  private async safeLog(
    eventName: string,
    params?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<void> {
    try {
      await analytics().logEvent(eventName, params);
    } catch {
      // Avoid breaking user flows if analytics fails.
    }
  }

  async trackSignUp(method = 'email'): Promise<void> {
    try {
      await analytics().logSignUp({method});
    } catch {
      // Avoid breaking user flows if analytics fails.
    }
  }

  async trackItemListed(payload: ItemListedPayload): Promise<void> {
    await this.safeLog('item_listed', {
      item_id: payload.itemId,
      category_id: payload.categoryId,
      district: payload.district,
      daily_rate: payload.dailyRate,
      caucao: payload.caucao,
      image_count: payload.imageCount,
    });
  }

  async trackRentalPaid(rental: Rental): Promise<void> {
    const startMs = Date.parse(rental.startDate);
    const endMs = Date.parse(rental.endDate);
    const durationDays =
      Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)))
        : undefined;

    await this.safeLog('rental_paid', {
      rental_id: rental.id,
      item_id: rental.item?.id,
      total_price: rental.totalPrice,
      caucao_amount: rental.caucaoAmount,
      duration_days: durationDays,
      payment_status: rental.paymentStatus,
      rental_status: rental.status,
    });
  }
}

export const analyticsService = new AnalyticsService();
