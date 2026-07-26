import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {i18n} from '../locales';

type Props = {
  onRetry: () => void;
};

export default function BackendCommunicationError({onRetry}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{i18n.common.backendUnavailable}</Text>
      <TouchableOpacity style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>{i18n.common.retry}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
