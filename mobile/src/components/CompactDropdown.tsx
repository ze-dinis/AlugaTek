import React, {useMemo, useState} from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {i18n} from '../locales';

export type CompactDropdownOption = {
  label: string;
  value: string;
};

type Props = {
  options: CompactDropdownOption[];
  selectedValue: string;
  onValueChange: (value: string) => void;
  placeholder: string;
};

export default function CompactDropdown({
  options,
  selectedValue,
  onValueChange,
  placeholder,
}: Props) {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(
    () => options.find(option => option.value === selectedValue)?.label,
    [options, selectedValue],
  );

  const close = () => setOpen(false);

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        accessibilityRole="button"
        onPress={() => setOpen(true)}>
        <Text style={selectedLabel ? styles.triggerText : styles.placeholderText} numberOfLines={1}>
          {selectedLabel ?? placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={styles.sheet}>
            <ScrollView>
              {options.map(option => {
                const isSelected = option.value === selectedValue;
                return (
                  <TouchableOpacity
                    key={option.value || '__empty__'}
                    style={[styles.option, isSelected && styles.optionSelected]}
                    onPress={() => {
                      onValueChange(option.value);
                      close();
                    }}>
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.cancelButton} onPress={close}>
              <Text style={styles.cancelText}>{i18n.common.cancel}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    height: 36,
    borderWidth: 1,
    borderColor: '#d8e0ea',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerText: {
    flex: 1,
    color: '#1f2937',
    fontSize: 14,
  },
  placeholderText: {
    flex: 1,
    color: '#8b95a5',
    fontSize: 14,
  },
  chevron: {
    color: '#5e6b7a',
    marginLeft: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    width: '100%',
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  optionSelected: {
    backgroundColor: '#eef4ff',
  },
  optionText: {
    color: '#1f2937',
    fontSize: 15,
  },
  optionTextSelected: {
    color: '#1a73e8',
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 12,
  },
  cancelText: {
    textAlign: 'center',
    color: '#5e6b7a',
    fontWeight: '600',
  },
});
