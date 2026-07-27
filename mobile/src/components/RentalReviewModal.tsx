import React from 'react';
import {Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet} from 'react-native';
import {i18n} from '../locales';

type RentalReviewModalProps = {
  visible: boolean;
  targetName: string;
  rating: number;
  comment: string;
  submitting: boolean;
  onChangeRating: (value: number) => void;
  onChangeComment: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export default function RentalReviewModal({
  visible,
  targetName,
  rating,
  comment,
  submitting,
  onChangeRating,
  onChangeComment,
  onSubmit,
  onClose,
}: RentalReviewModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !submitting && onClose()}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{i18n.rentalReview.title}</Text>
          <Text style={styles.modalSubtitle}>{i18n.rentalReview.subtitle(targetName)}</Text>

          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map(star => (
              <TouchableOpacity
                key={star}
                onPress={() => onChangeRating(star)}
                disabled={submitting}
                style={styles.starButton}>
                <Text style={[styles.starText, rating >= star ? styles.starSelected : styles.starUnselected]}>
                  ★
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder={i18n.rentalReview.commentPlaceholder}
            placeholderTextColor="#8b95a5"
            value={comment}
            onChangeText={onChangeComment}
            editable={!submitting}
            multiline
            textAlignVertical="top"
            maxLength={400}
          />

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.disabledButton]}
            onPress={onSubmit}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>{i18n.rentalReview.submit}</Text>
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
  ratingRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  starButton: {
    paddingRight: 8,
  },
  starText: {
    fontSize: 30,
    lineHeight: 34,
  },
  starSelected: {
    color: '#f9a825',
  },
  starUnselected: {
    color: '#d0d7e2',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d7e2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    backgroundColor: '#fff',
    color: '#1f2937',
  },
  inputMultiline: {
    minHeight: 90,
  },
  submitButton: {
    backgroundColor: '#2e7d32',
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
