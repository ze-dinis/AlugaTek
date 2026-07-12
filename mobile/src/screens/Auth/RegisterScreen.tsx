import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {AuthStackParamList} from '../../navigation/AppNavigator';
import {authService} from '../../services/authService';
import {i18n} from '../../locales';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export default function RegisterScreen({navigation}: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert(i18n.common.error, i18n.auth.errorFillFields);
      return;
    }
    if (password.length < 6) {
      Alert.alert(i18n.common.error, i18n.auth.errorPasswordMinLength);
      return;
    }
    setLoading(true);
    try {
      const {data} = await authService.register(name, email, password);
      Alert.alert(i18n.common.success, data.message ?? i18n.auth.verificationEmailSent, [
        {
          text: i18n.common.ok,
          onPress: () => navigation.navigate('Login'),
        },
      ]);
    } catch (e: any) {
      Alert.alert(i18n.auth.registrationFailed, e.response?.data?.message ?? i18n.auth.tryAgain);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{i18n.auth.createAccount}</Text>

      <TextInput style={styles.input} placeholder={i18n.auth.fullName} value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder={i18n.auth.email}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder={i18n.auth.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{i18n.auth.createAccount}</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>{i18n.auth.hasAccount}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff'},
  title: {fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 32, color: '#1a73e8'},
  input: {borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16},
  button: {backgroundColor: '#1a73e8', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12},
  buttonText: {color: '#fff', fontWeight: '600', fontSize: 16},
  link: {textAlign: 'center', color: '#1a73e8', marginTop: 8},
});
