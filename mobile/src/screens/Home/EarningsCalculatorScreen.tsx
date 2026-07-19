import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import Slider from '@react-native-community/slider';

type ExampleItem = {
  id: string;
  name: string;
  dailyRate: number;
  icon: string;
  isCustom?: boolean;
};

const CUSTOM_ITEM_ID = 'custom';

const EXAMPLE_ITEMS: ExampleItem[] = [
  {id: 'ps5', name: 'PS5', dailyRate: 18, icon: '🎮'},
  {id: 'iphone', name: 'iPhone', dailyRate: 16, icon: '📱'},
  {id: CUSTOM_ITEM_ID, name: 'Item aleatório', dailyRate: 10, icon: '🎲', isCustom: true},
];

const MIN_RENTAL_DAYS_PER_MONTH = 1;
const MAX_RENTAL_DAYS_PER_MONTH = 30;
const MIN_ITEMS = 0;
const MAX_ITEMS = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatEuro(amount: number): string {
  return `${amount.toFixed(2)}€`;
}

function parseDailyRate(value: string): number {
  const normalized = value.replace(',', '.').trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

export default function EarningsCalculatorScreen() {
  const [rentalDaysPerMonth, setRentalDaysPerMonth] = useState(12);
  const [customDailyRateInput, setCustomDailyRateInput] = useState('10');
  const [unitsByItemId, setUnitsByItemId] = useState<Record<string, number>>({
    ps5: 1,
    iphone: 1,
    [CUSTOM_ITEM_ID]: 0,
  });

  const itemRows = useMemo(
    () => EXAMPLE_ITEMS.map(item => {
      const units = unitsByItemId[item.id] ?? 0;
      const effectiveDailyRate = item.isCustom ? parseDailyRate(customDailyRateInput) : item.dailyRate;
      const monthly = effectiveDailyRate * rentalDaysPerMonth * units;
      return {item, units, monthly, effectiveDailyRate};
    }),
    [rentalDaysPerMonth, unitsByItemId, customDailyRateInput],
  );

  const totalMonthly = useMemo(
    () => itemRows.reduce((sum, row) => sum + row.monthly, 0),
    [itemRows],
  );

  const changeUnits = (itemId: string, delta: number) => {
    setUnitsByItemId(prev => ({
      ...prev,
      [itemId]: clamp((prev[itemId] ?? 1) + delta, MIN_ITEMS, MAX_ITEMS),
    }));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Calcula quanto podes ganhar</Text>
      <Text style={styles.subtitle}>
        Simula ganhos mensais com PS5, iPhone e um item com preço por dia configurável.
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Dias alugados por mês</Text>
        <Text style={styles.counterValue}>{rentalDaysPerMonth} dias</Text>
        <Slider
          style={styles.daysSlider}
          minimumValue={MIN_RENTAL_DAYS_PER_MONTH}
          maximumValue={MAX_RENTAL_DAYS_PER_MONTH}
          step={1}
          value={rentalDaysPerMonth}
          minimumTrackTintColor="#1a73e8"
          maximumTrackTintColor="#d8e0ea"
          thumbTintColor="#1a73e8"
          onValueChange={setRentalDaysPerMonth}
        />
        <View style={styles.sliderLegend}>
          <Text style={styles.sliderLegendText}>{MIN_RENTAL_DAYS_PER_MONTH} dia</Text>
          <Text style={styles.sliderLegendText}>{MAX_RENTAL_DAYS_PER_MONTH} dias</Text>
        </View>
      </View>

      {itemRows.map(({item, units, monthly, effectiveDailyRate}) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemTitle}>{item.icon} {item.name}</Text>
            <Text style={styles.dailyRate}>{formatEuro(effectiveDailyRate)}/dia</Text>
          </View>

          {item.isCustom && (
            <View style={styles.customInputRow}>
              <Text style={styles.customInputLabel}>Preço por dia</Text>
              <TextInput
                style={styles.customInput}
                value={customDailyRateInput}
                onChangeText={setCustomDailyRateInput}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="#8b95a5"
              />
            </View>
          )}

          <View style={styles.counterRow}>
            <TouchableOpacity
              style={styles.counterButton}
              onPress={() => changeUnits(item.id, -1)}
              disabled={units <= MIN_ITEMS}>
              <Text style={styles.counterButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.counterValue}>{units} unidade{units > 1 ? 's' : ''}</Text>
            <TouchableOpacity
              style={styles.counterButton}
              onPress={() => changeUnits(item.id, 1)}
              disabled={units >= MAX_ITEMS}>
              <Text style={styles.counterButtonText}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.monthlyValue}>Potencial mensal: {formatEuro(monthly)}</Text>
        </View>
      ))}

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total potencial por mês</Text>
        <Text style={styles.totalValue}>{formatEuro(totalMonthly)}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f3f6fb'},
  content: {padding: 16, paddingBottom: 28},
  title: {fontSize: 24, fontWeight: '800', color: '#1f2937'},
  subtitle: {fontSize: 14, color: '#526072', marginTop: 6, marginBottom: 14},
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e4eaf2',
  },
  sectionLabel: {fontSize: 13, color: '#5f6b7a', marginBottom: 8, fontWeight: '600'},
  counterRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  counterButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e8f0fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterButtonText: {fontSize: 22, color: '#1a73e8', fontWeight: '700', lineHeight: 22},
  counterValue: {fontSize: 16, color: '#1f2937', fontWeight: '700'},
  daysSlider: {width: '100%', height: 36, marginTop: 4},
  sliderLegend: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 2},
  sliderLegendText: {fontSize: 12, color: '#667386'},
  itemHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10},
  itemTitle: {fontSize: 17, fontWeight: '800', color: '#1f2937'},
  dailyRate: {fontSize: 13, color: '#667386', fontWeight: '600'},
  customInputRow: {marginBottom: 12},
  customInputLabel: {fontSize: 12, color: '#5f6b7a', fontWeight: '600', marginBottom: 6},
  customInput: {
    borderWidth: 1,
    borderColor: '#d8e0ea',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#1f2937',
    fontSize: 15,
    backgroundColor: '#fff',
  },
  monthlyValue: {marginTop: 12, fontSize: 15, color: '#0f4a9f', fontWeight: '800'},
  totalCard: {
    backgroundColor: '#1a73e8',
    borderRadius: 14,
    padding: 16,
    marginTop: 4,
  },
  totalLabel: {fontSize: 14, color: '#dce9ff', fontWeight: '600'},
  totalValue: {fontSize: 30, color: '#fff', fontWeight: '800', marginTop: 4},
  totalHint: {fontSize: 12, color: '#dce9ff', marginTop: 6},
});
