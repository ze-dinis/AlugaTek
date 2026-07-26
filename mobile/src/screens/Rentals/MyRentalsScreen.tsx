import React, {useCallback, useState} from 'react';
import {View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {rentalsService} from '../../services/rentalsService';
import PaymentModal from '../../components/PaymentModal';
import DisputeModal from '../../components/DisputeModal';
import BackendCommunicationError from '../../components/BackendCommunicationError';
import {Rental} from '../../types';
import {i18n} from '../../locales';
import {isBackendCommunicationError} from '../../utils/networkError';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const STATUS_COLORS: Record<string, string> = {
  Pending: '#ff9800',
  Active: '#4caf50',
  Completed: '#4caf50',
  ReturnRequested: '#fbc02d',
  Returned: '#9e9e9e',
  Cancelled: '#f44336',
};

const STATUS_LABELS: Record<string, string> = {
  Pending: i18n.myRentals.pending,
  Active: i18n.myRentals.active,
  Completed: i18n.myRentals.completed,
  ReturnRequested: i18n.myRentals.returnRequested,
  Returned: i18n.myRentals.returned,
  Cancelled: i18n.myRentals.cancelled,
};

export default function MyRentalsScreen() {
  const navigation = useNavigation<NavProp>();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [returningRentalId, setReturningRentalId] = useState<string | null>(null);
  const [quotingRenewalRentalId, setQuotingRenewalRentalId] = useState<string | null>(null);
  const [renewingRentalId, setRenewingRentalId] = useState<string | null>(null);
  const [renewDayPickerRental, setRenewDayPickerRental] = useState<Rental | null>(null);
  const [renewPaymentTarget, setRenewPaymentTarget] = useState<{
    rental: Rental;
    extraDays: number;
    additionalAmount: number;
    platformCommission: number;
    totalCharge: number;
  } | null>(null);
  const [payingRental, setPayingRental] = useState<Rental | null>(null);
  const [disputeRental, setDisputeRental] = useState<Rental | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeDescription, setDisputeDescription] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const [backendUnavailable, setBackendUnavailable] = useState(false);

  const loadRentals = useCallback(async () => {
    try {
      const response = await rentalsService.getMyRentals();
      setRentals(response.data);
      setBackendUnavailable(false);
    } catch (error) {
      setBackendUnavailable(isBackendCommunicationError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadRentals();
    }, [loadRentals]),
  );

  const handleReturnRental = async (rentalId: string) => {
    setReturningRentalId(rentalId);
    try {
      await rentalsService.returnRental(rentalId);
      void loadRentals();
    } catch {
      Alert.alert('Erro', 'Não foi possível devolver o item.');
    } finally {
      setReturningRentalId(null);
    }
  };

  const renewByDays = async (rental: Rental, extraDays: number) => {
    setQuotingRenewalRentalId(rental.id);
    try {
      const quote = await rentalsService.getRenewQuote(rental.id, extraDays);
      setRenewPaymentTarget({
        rental,
        extraDays,
        additionalAmount: quote.data.additionalAmount,
        platformCommission: quote.data.platformCommission,
        totalCharge: quote.data.totalCharge,
      });
    } catch {
      Alert.alert(i18n.common.error, i18n.myRentals.renewFailed);
    } finally {
      setQuotingRenewalRentalId(null);
    }
  };

  const handleRenewRental = (rental: Rental) => {
    setRenewDayPickerRental(rental);
  };

  const handleOpenDispute = (rental: Rental) => {
    setDisputeRental(rental);
    setDisputeReason('');
    setDisputeDescription('');
  };

  const handleSubmitDispute = async () => {
    if (!disputeRental) return;
    if (!disputeReason.trim() || !disputeDescription.trim()) {
      Alert.alert('Erro', 'Preencha motivo e descrição da disputa.');
      return;
    }

    setSubmittingDispute(true);
    try {
      await rentalsService.openDispute(disputeRental.id, {
        reason: disputeReason.trim(),
        description: disputeDescription.trim(),
      });
      setDisputeRental(null);
      Alert.alert('Sucesso', 'Disputa aberta. A equipa de suporte irá analisar.');
      void loadRentals();
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir a disputa.');
    } finally {
      setSubmittingDispute(false);
    }
  };

  if (loading) return <ActivityIndicator style={{flex: 1}} size="large" color="#1a73e8" />;
  if (backendUnavailable && rentals.length === 0) {
    return (
      <BackendCommunicationError
        onRetry={() => {
          setLoading(true);
          void loadRentals();
        }}
      />
    );
  }

  return (
    <>
      {renewPaymentTarget && (
        <PaymentModal
          rentalId={renewPaymentTarget.rental.id}
          amount={renewPaymentTarget.totalCharge}
          caucaoAmount={0}
          visible
          confirmLabel={i18n.payment.renewConfirm}
          noteText={i18n.payment.renewHoldNote}
          breakdownRows={[
            {label: i18n.myRentals.renewBreakdownAdditional, value: renewPaymentTarget.additionalAmount},
            {label: i18n.myRentals.renewBreakdownCommission, value: renewPaymentTarget.platformCommission},
            {label: i18n.myRentals.renewBreakdownTotal, value: renewPaymentTarget.totalCharge},
          ]}
          onClose={() => {
            if (!renewingRentalId) {
              setRenewPaymentTarget(null);
            }
          }}
          onAuthorizePaymentMethod={async paymentMethodId => {
            setRenewingRentalId(renewPaymentTarget.rental.id);
            try {
              await rentalsService.renew(
                renewPaymentTarget.rental.id,
                renewPaymentTarget.extraDays,
                paymentMethodId,
              );
            } finally {
              setRenewingRentalId(null);
            }
          }}
          onSuccess={() => {
            setRenewPaymentTarget(null);
            Alert.alert(i18n.common.success, i18n.myRentals.renewSuccess);
            void loadRentals();
          }}
        />
      )}
      <Modal
        visible={!!renewDayPickerRental}
        transparent
        animationType="fade"
        onRequestClose={() => setRenewDayPickerRental(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.dayPickerCard}>
            <Text style={styles.dayPickerTitle}>{i18n.myRentals.renewTitle}</Text>
            <Text style={styles.dayPickerMessage}>{i18n.myRentals.renewMessage}</Text>

            {Array.from({length: 6}, (_, i) => {
              const day = i + 1;
              return (
                <TouchableOpacity
                  key={day}
                  style={styles.dayOptionButton}
                  onPress={() => {
                    if (!renewDayPickerRental) return;
                    const selectedRental = renewDayPickerRental;
                    setRenewDayPickerRental(null);
                    void renewByDays(selectedRental, day);
                  }}>
                  <Text style={styles.dayOptionText}>
                    {day} {day === 1 ? i18n.myRentals.day : i18n.myRentals.days}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.dayOptionCancelButton}
              onPress={() => setRenewDayPickerRental(null)}>
              <Text style={styles.dayOptionCancelText}>{i18n.common.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DisputeModal
        visible={!!disputeRental}
        reason={disputeReason}
        description={disputeDescription}
        submitting={submittingDispute}
        onChangeReason={setDisputeReason}
        onChangeDescription={setDisputeDescription}
        onSubmit={() => void handleSubmitDispute()}
        onClose={() => setDisputeRental(null)}
      />

      <FlatList
        data={rentals}
        keyExtractor={r => r.id}
        contentContainerStyle={styles.list}
        renderItem={({item}) => (
          (() => {
            const endDateMs = new Date(item.endDate).getTime();
            const hoursUntilExpiry = (endDateMs - Date.now()) / (1000 * 60 * 60);
            const isExpiringIn24h = item.status === 'Completed' && hoursUntilExpiry > 0 && hoursUntilExpiry <= 24;

            return (
              <TouchableOpacity
                style={styles.cardTouchable}
                onPress={() => navigation.navigate('ItemDetail', {itemId: item.item.id})}>
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.itemTitle}>{item.item.title}</Text>
                    <View style={[styles.badge, {backgroundColor: STATUS_COLORS[item.status] ?? '#ccc'}]}>
                      <Text style={styles.badgeText}>{STATUS_LABELS[item.status] ?? item.status}</Text>
                    </View>
                  </View>
                  {(item.status === 'Completed' || item.status === 'Returned') && (
                    <Text style={styles.dates}>
                      {new Date(item.startDate).toLocaleDateString()} → {new Date(item.endDate).toLocaleDateString()}
                    </Text>
                  )}
                  {isExpiringIn24h && (
                    <Text style={styles.expiryWarning}>{i18n.myRentals.expiresIn24h}</Text>
                  )}
                  <Text style={styles.total}>{i18n.itemDetail.total}: {item.totalPrice.toFixed(2)}€</Text>
                  {item.status === 'Active' && item.paymentStatus === 'None' && (
                    <TouchableOpacity
                      style={styles.payButton}
                      onPress={() => setPayingRental(item)}>
                      <Text style={styles.payButtonText}>💳 {i18n.payment.confirm}</Text>
                    </TouchableOpacity>
                  )}
                  {isExpiringIn24h && (
                    <TouchableOpacity
                      style={[styles.renewButton, (renewingRentalId === item.id || quotingRenewalRentalId === item.id) && styles.returnButtonDisabled]}
                      onPress={() => handleRenewRental(item)}
                      disabled={renewingRentalId === item.id || quotingRenewalRentalId === item.id}>
                      {renewingRentalId === item.id || quotingRenewalRentalId === item.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.renewButtonText}>{i18n.myRentals.renew}</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {item.status === 'Completed' && (
                    <TouchableOpacity
                      style={[styles.returnButton, returningRentalId === item.id && styles.returnButtonDisabled]}
                      onPress={() => handleReturnRental(item.id)}
                      disabled={returningRentalId === item.id}>
                      {returningRentalId === item.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.returnButtonText}>Devolver</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {(item.status === 'Completed' || item.status === 'ReturnRequested') && (
                    <TouchableOpacity
                      style={styles.disputeButton}
                      onPress={() => handleOpenDispute(item)}>
                      <Text style={styles.disputeButtonText}>Abrir disputa</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })()
        )}
        ListEmptyComponent={<Text style={styles.empty}>{i18n.myRentals.noRentals}</Text>}
      />
      {payingRental && (
        <PaymentModal
          rentalId={payingRental.id}
          amount={payingRental.totalPrice}
          visible
          onClose={() => setPayingRental(null)}
          onSuccess={() => {
            setPayingRental(null);
            Alert.alert(i18n.payment.successTitle, i18n.payment.successMessage);
            void loadRentals();
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  list: {padding: 16},
  cardTouchable: {marginBottom: 12},
  card: {backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  itemTitle: {fontWeight: '600', fontSize: 16, flex: 1},
  badge: {borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3},
  badgeText: {color: '#fff', fontSize: 12, fontWeight: '600'},
  dates: {color: '#666', marginTop: 6},
  total: {fontWeight: '700', color: '#1a73e8', marginTop: 4},
  returnButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#fbc02d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  returnButtonDisabled: {opacity: 0.7},
  returnButtonText: {color: '#5d4037', fontWeight: '700'},
  payButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  payButtonText: {color: '#fff', fontWeight: '700'},
  renewButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  renewButtonText: {color: '#fff', fontWeight: '700'},
  expiryWarning: {
    marginTop: 8,
    color: '#d32f2f',
    fontWeight: '600',
  },
  empty: {textAlign: 'center', marginTop: 40, color: '#888'},
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dayPickerCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  dayPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f1f1f',
  },
  dayPickerMessage: {
    marginTop: 6,
    marginBottom: 12,
    color: '#555',
  },
  dayOptionButton: {
    backgroundColor: '#f3f7ff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  dayOptionText: {
    color: '#1a73e8',
    fontWeight: '700',
    textAlign: 'center',
  },
  dayOptionCancelButton: {
    marginTop: 6,
    paddingVertical: 10,
  },
  dayOptionCancelText: {
    color: '#666',
    textAlign: 'center',
    fontWeight: '600',
  },
  disputeButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#d84315',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  disputeButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
