import React, {useState} from 'react';
import {
  View,
  Text,
  Image,
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
import {i18n} from '../../locales';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

GoogleSignin.configure({webClientId: GOOGLE_WEB_CLIENT_ID});

export default function LoginScreen({navigation}: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore(s => s.setAuth);
  const titleText = i18n.auth.title;
  const tekMatch = /(tek)$/i.exec(titleText);
  const tekSuffix = tekMatch ? tekMatch[1] : '';
  const titlePrefix = tekSuffix ? titleText.slice(0, -tekSuffix.length) : titleText;

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(i18n.common.error, i18n.auth.errorFillFields);
      return;
    }
    setLoading(true);
    try {
      const {data} = await authService.login(email, password);
      await setAuth(data.user, data.token);
    } catch (e: any) {
      const message = e?.response?.data?.message || e?.message || i18n.auth.tryAgain;
      const detail =
        e?.code === 'ERR_NETWORK'
          ? i18n.auth.errorNetworkDetail
          : message;

      Alert.alert(i18n.auth.loginFailed, detail);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      // Ensure user can pick an account every time instead of reusing cached session.
      try {
        await GoogleSignin.signOut();
      } catch {
        // Ignore when there is no previous session.
      }
      const userInfo = await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      const {data} = await authService.googleOAuth(tokens.idToken);
      await setAuth(data.user, data.token);
    } catch (e: any) {
      Alert.alert(i18n.auth.googleLoginFailed, e.message ?? i18n.auth.tryAgain);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../../../blue.png')}
        style={styles.logoIcon}
        resizeMode="contain"
      />
      <Text style={styles.title}>
        {titlePrefix}
        {tekSuffix ? <Text style={styles.titleTek}>{tekSuffix}</Text> : null}
      </Text>
      <Image
        source={require('../../../footer.png')}
        style={styles.subtitleImage}
        resizeMode="contain"
      />

      <TextInput
        style={styles.input}
        placeholder={i18n.auth.email}
        placeholderTextColor="#8b95a5"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder={i18n.auth.password}
        placeholderTextColor="#8b95a5"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{i18n.auth.signIn}</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.googleButton]} onPress={handleGoogleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{i18n.auth.signInGoogle}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={styles.link}>{i18n.auth.noAccount}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff'},
  logoIcon: {width: 72, height: 72, alignSelf: 'center', marginBottom: 12},
  title: {fontSize: 32, fontWeight: 'bold', textAlign: 'center', color: '#1a73e8'},
  titleTek: {color: '#1a99e8'},
  subtitleImage: {width: '100%', height: 120, alignSelf: 'center', marginBottom: 24},
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    color: '#1f2937',
  },
  button: {backgroundColor: '#1a73e8', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12},
  googleButton: {backgroundColor: '#db4437'},
  buttonText: {color: '#fff', fontWeight: '600', fontSize: 16},
  link: {textAlign: 'center', color: '#1a73e8', marginTop: 8},
});
