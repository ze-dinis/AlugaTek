import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {AuthStackParamList} from '../../navigation/AppNavigator';
import {authService} from '../../services/authService';
import {useAuthStore} from '../../store/authStore';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {GOOGLE_WEB_CLIENT_ID} from '../../config';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

GoogleSignin.configure({webClientId: GOOGLE_WEB_CLIENT_ID});

export default function LoginScreen({navigation}: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore(s => s.setAuth);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      const {data} = await authService.login(email, password);
      await setAuth(data.user, data.token);
    } catch (e: any) {
      const message = e?.response?.data?.message || e?.message || 'Please try again.';
      const detail =
        e?.code === 'ERR_NETWORK'
          ? 'The app could not reach the API. Make sure the backend is running and the API URL points to your machine\'s LAN IP.'
          : message;

      Alert.alert('Login failed', detail);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      const {data} = await authService.googleOAuth(tokens.idToken);
      await setAuth(data.user, data.token);
    } catch (e: any) {
      Alert.alert('Google login failed', e.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alugatek</Text>
      <Text style={styles.subtitle}>Rent tech. Simply.</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.googleButton]} onPress={handleGoogleLogin} disabled={loading}>
        <Text style={styles.buttonText}>Sign in with Google</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={styles.link}>Don't have an account? Register</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff'},
  title: {fontSize: 32, fontWeight: 'bold', textAlign: 'center', color: '#1a73e8'},
  subtitle: {fontSize: 16, textAlign: 'center', color: '#666', marginBottom: 32},
  input: {borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16},
  button: {backgroundColor: '#1a73e8', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12},
  googleButton: {backgroundColor: '#db4437'},
  buttonText: {color: '#fff', fontWeight: '600', fontSize: 16},
  link: {textAlign: 'center', color: '#1a73e8', marginTop: 8},
});
