import AsyncStorage from '@react-native-async-storage/async-storage';

const PAYOUT_DESCRIPTION_KEY = 'payout_description';

export const payoutPreferenceService = {
  getPaymentDescription: async (): Promise<string | null> => {
    const value = await AsyncStorage.getItem(PAYOUT_DESCRIPTION_KEY);
    if (!value) return null;

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  },

  setPaymentDescription: async (value: string): Promise<void> => {
    const normalized = value.trim();
    if (!normalized) {
      await AsyncStorage.removeItem(PAYOUT_DESCRIPTION_KEY);
      return;
    }

    await AsyncStorage.setItem(PAYOUT_DESCRIPTION_KEY, normalized);
  },
};
