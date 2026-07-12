import React from 'react';
import {Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet} from 'react-native';
import {i18n} from '../locales';

type DisputeModalProps = {
  visible: boolean;
  reason: string;
  description: string;
  submitting: boolean;
  onChangeReason: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
};

export default function DisputeModal({
  visible,
  reason,
  description,
  submitting,
  onChangeReason,
  onChangeDescription,
  onSubmit,
  onClose,
  title = 'Abrir disputa',
  subtitle = 'Descreva o problema para a equipa de suporte.',
}: DisputeModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !submitting && onClose()}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalSubtitle}>{subtitle}</Text>

          <TextInput
            style={styles.input}
            placeholder="Motivo (ex.: item danificado)"
            value={reason}
            onChangeText={onChangeReason}
            editable={!submitting}
          />

          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Descrição detalhada"
            value={description}
            onChangeText={onChangeDescription}
            editable={!submitting}
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.disabledButton]}
            onPress={onSubmit}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Enviar disputa</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={submitting}>
            <Text style={styles.cancelText}>{i18n.common.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f1f1f',
  },
  modalSubtitle: {
    marginTop: 6,
    marginBottom: 12,
    color: '#555',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d7e2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  inputMultiline: {
    minHeight: 90,
  },
  submitButton: {
    backgroundColor: '#d84315',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.7,
  },
  cancelButton: {
    marginTop: 6,
    paddingVertical: 10,
  },
  cancelText: {
    color: '#666',
    textAlign: 'center',
    fontWeight: '600',
  },
});