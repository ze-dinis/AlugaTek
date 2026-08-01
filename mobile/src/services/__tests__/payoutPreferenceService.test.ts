import AsyncStorage from '@react-native-async-storage/async-storage';
import {payoutPreferenceService} from '../payoutPreferenceService';

describe('payoutPreferenceService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns null when nothing was stored', async () => {
    await expect(payoutPreferenceService.getPaymentDescription()).resolves.toBeNull();
  });

  it('round-trips a payout description', async () => {
    await payoutPreferenceService.setPaymentDescription('IBAN PT50 0002 0123');

    await expect(payoutPreferenceService.getPaymentDescription()).resolves.toBe(
      'IBAN PT50 0002 0123',
    );
  });

  it('trims the value before storing it', async () => {
    await payoutPreferenceService.setPaymentDescription('   MB WAY +351912345678   ');

    await expect(AsyncStorage.getItem('payout_description')).resolves.toBe(
      'MB WAY +351912345678',
    );
  });

  it('clears the stored value when set to blank', async () => {
    await payoutPreferenceService.setPaymentDescription('IBAN PT50 0002 0123');
    await payoutPreferenceService.setPaymentDescription('   ');

    await expect(AsyncStorage.getItem('payout_description')).resolves.toBeNull();
    await expect(payoutPreferenceService.getPaymentDescription()).resolves.toBeNull();
  });

  it('treats a whitespace-only stored value as missing', async () => {
    await AsyncStorage.setItem('payout_description', '    ');

    await expect(payoutPreferenceService.getPaymentDescription()).resolves.toBeNull();
  });
});
