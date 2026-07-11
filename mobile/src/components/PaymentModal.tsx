import React, {useState} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import {CardField, useStripe} from '@stripe/stripe-react-native';
import {rentalsService} from '../services/rentalsService';
import {i18n} from '../locales';

interface Props {
  rentalId: string;
  amount: number;
  caucaoAmount: number;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaymentModal({rentalId, amount, caucaoAmount, visible, onClose, onSuccess}: Props) {
  const {createPaymentMethod} = useStripe();
  const [cardComplete, setCardComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    if (!cardComplete) {
      Alert.alert(i18n.common.error, i18n.payment.incompleteCard);
      return;
    }

    setLoading(true);
    try {
      const {paymentMethod, error} = await createPaymentMethod({
        paymentMethodType: 'Card',
      });

      if (error) {
        Alert.alert(i18n.common.error, `${error.message} (${error.code})`);
        return;
      }

      if (!paymentMethod) {
        Alert.alert(i18n.common.error, i18n.payment.failed);
        return;
      }

      await rentalsService.pay(rentalId, paymentMethod.id);
      onSuccess();
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? i18n.payment.failed;
      Alert.alert(i18n.common.error, msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ScrollView
          contentContainerStyle={styles.sheet}
          keyboardShouldPersistTaps="handled"
          bounces={false}>
          <Text style={styles.title}>{i18n.payment.title}</Text>
          <Text style={styles.amount}>{amount.toFixed(2)}€</Text>
          {caucaoAmount > 0 && (
            <Text style={styles.caucaoNote}>🔒 Caução retida no cartão: {caucaoAmount.toFixed(2)}€</Text>
          )}
          <Text style={styles.holdNote}>{i18n.payment.holdNote}</Text>

          <CardField
            postalCodeEnabled={false}
            style={styles.cardField}
            cardStyle={styles.card}
            onCardChange={details => setCardComplete(details.complete)}
          />

          <TouchableOpacity
            style={[styles.payButton, (!cardComplete || loading) && styles.payButtonDisabled]}
            onPress={handlePay}
            disabled={!cardComplete || loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.payButtonText}>{i18n.payment.confirm}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={loading}>
            <Text style={styles.cancelButtonText}>{i18n.common.cancel}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
    flexGrow: 1,
  },
  title: {fontSize: 18, fontWeight: '700', marginBottom: 4},
  amount: {fontSize: 28, fontWeight: '800', color: '#1a73e8', marginBottom: 4},
  holdNote: {fontSize: 12, color: '#888', marginBottom: 20},
  caucaoNote: {fontSize: 13, color: '#e65100', fontWeight: '600', marginBottom: 6},
  cardField: {height: 50, marginBottom: 20},
  card: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    textColor: '#000000',
  } as any,
  payButton: {
    backgroundColor: '#1a73e8',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  payButtonDisabled: {opacity: 0.5},
  payButtonText: {color: '#fff', fontWeight: '700', fontSize: 16},
  cancelButton: {alignItems: 'center', padding: 10},
  cancelButtonText: {color: '#666', fontSize: 15},
});
