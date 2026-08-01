import React from 'react';
import {Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import LoginScreen from '../Auth/LoginScreen';
import {useAuthStore} from '../../store/authStore';
import {i18n} from '../../locales';
import {installHttpMock, HttpMock} from '../../testing/httpMock';

const navigation = {navigate: jest.fn(), goBack: jest.fn()};

function renderLogin() {
  return render(<LoginScreen navigation={navigation as never} route={{} as never} />);
}

const authPayload = {
  token: 'jwt-token',
  user: {id: 'user-1', name: 'Ana Silva', email: 'ana@example.com'},
};

describe('LoginScreen (integration)', () => {
  let http: HttpMock;
  let alertSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    useAuthStore.setState({user: null, token: null, isLoading: false});
    http = installHttpMock();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    http.restore();
    alertSpy.mockRestore();
  });

  it('signs the user in and persists the session end to end', async () => {
    http.on('post', '/auth/login', 200, authPayload);
    renderLogin();

    fireEvent.changeText(screen.getByPlaceholderText(i18n.auth.email), 'ana@example.com');
    fireEvent.changeText(
      screen.getByPlaceholderText(i18n.auth.password),
      'Password123!',
    );
    fireEvent.press(screen.getByText(i18n.auth.signIn));

    await waitFor(() => {
      expect(useAuthStore.getState().token).toBe('jwt-token');
    });

    expect(http.lastRequest()).toMatchObject({
      method: 'post',
      url: '/auth/login',
      data: {email: 'ana@example.com', password: 'Password123!'},
    });
    expect(useAuthStore.getState().user).toEqual(authPayload.user);
    await expect(AsyncStorage.getItem('auth_token')).resolves.toBe('jwt-token');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not call the API when fields are empty', async () => {
    renderLogin();

    fireEvent.press(screen.getByText(i18n.auth.signIn));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        i18n.common.error,
        i18n.auth.errorFillFields,
      );
    });
    expect(http.requests).toHaveLength(0);
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('surfaces the backend error message and keeps the user signed out', async () => {
    http.on('post', '/auth/login', 401, {message: 'Credenciais inválidas'});
    renderLogin();

    fireEvent.changeText(screen.getByPlaceholderText(i18n.auth.email), 'ana@example.com');
    fireEvent.changeText(screen.getByPlaceholderText(i18n.auth.password), 'wrong');
    fireEvent.press(screen.getByText(i18n.auth.signIn));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        i18n.auth.loginFailed,
        'Credenciais inválidas',
      );
    });
    expect(useAuthStore.getState().token).toBeNull();
    await expect(AsyncStorage.getItem('auth_token')).resolves.toBeNull();
  });

  it('exchanges the Google id token for a session', async () => {
    http.on('post', '/auth/oauth/google', 200, authPayload);
    renderLogin();

    fireEvent.press(screen.getByText(i18n.auth.signInGoogle));

    await waitFor(() => {
      expect(useAuthStore.getState().token).toBe('jwt-token');
    });

    expect(GoogleSignin.hasPlayServices).toHaveBeenCalled();
    expect(http.lastRequest()).toMatchObject({
      method: 'post',
      url: '/auth/oauth/google',
      data: 'google-id-token',
    });
  });

  it('reports a failed Google sign-in without creating a session', async () => {
    (GoogleSignin.signIn as jest.Mock).mockRejectedValueOnce(
      new Error('Sign in cancelled'),
    );
    renderLogin();

    fireEvent.press(screen.getByText(i18n.auth.signInGoogle));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        i18n.auth.googleLoginFailed,
        'Sign in cancelled',
      );
    });
    expect(http.requests).toHaveLength(0);
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('navigates to the register screen', () => {
    renderLogin();

    fireEvent.press(screen.getByText(i18n.auth.noAccount));

    expect(navigation.navigate).toHaveBeenCalledWith('Register');
  });
});
