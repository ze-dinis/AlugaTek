import React from 'react';
import {Alert} from 'react-native';
import {fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import RegisterScreen from '../Auth/RegisterScreen';
import {i18n} from '../../locales';
import {installHttpMock, HttpMock} from '../../testing/httpMock';

const navigation = {navigate: jest.fn(), goBack: jest.fn()};

function renderRegister() {
  return render(<RegisterScreen navigation={navigation as never} route={{} as never} />);
}

function fillForm(password = 'Password123!') {
  fireEvent.changeText(screen.getByPlaceholderText(i18n.auth.fullName), 'Ana Silva');
  fireEvent.changeText(screen.getByPlaceholderText(i18n.auth.email), 'ana@example.com');
  fireEvent.changeText(screen.getByPlaceholderText(i18n.auth.password), password);
}

describe('RegisterScreen (integration)', () => {
  let http: HttpMock;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    http = installHttpMock();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    http.restore();
    alertSpy.mockRestore();
  });

  it('posts the registration and confirms the verification email', async () => {
    http.on('post', '/auth/register', 200, {message: 'Verifique o seu email.'});
    renderRegister();

    fillForm();
    fireEvent.press(screen.getAllByText(i18n.auth.createAccount)[1]);

    await waitFor(() => {
      expect(http.requestsTo('post', '/auth/register')).toHaveLength(1);
    });

    expect(http.lastRequest()).toMatchObject({
      data: {
        name: 'Ana Silva',
        email: 'ana@example.com',
        password: 'Password123!',
      },
    });
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        i18n.common.success,
        'Verifique o seu email.',
        expect.any(Array),
      );
    });
  });

  it('sends the user back to login from the success alert', async () => {
    http.on('post', '/auth/register', 200, {message: 'Conta criada.'});
    renderRegister();

    fillForm();
    fireEvent.press(screen.getAllByText(i18n.auth.createAccount)[1]);

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    const buttons = alertSpy.mock.calls[0][2] as Array<{onPress?: () => void}>;
    buttons[0].onPress?.();

    expect(navigation.navigate).toHaveBeenCalledWith('Login');
  });

  it('rejects empty forms before hitting the API', async () => {
    renderRegister();

    fireEvent.press(screen.getAllByText(i18n.auth.createAccount)[1]);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        i18n.common.error,
        i18n.auth.errorFillFields,
      );
    });
    expect(http.requests).toHaveLength(0);
  });

  it('enforces the minimum password length client-side', async () => {
    renderRegister();

    fillForm('12345');
    fireEvent.press(screen.getAllByText(i18n.auth.createAccount)[1]);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        i18n.common.error,
        i18n.auth.errorPasswordMinLength,
      );
    });
    expect(http.requests).toHaveLength(0);
  });

  it('shows the backend validation message when registration fails', async () => {
    http.on('post', '/auth/register', 400, {message: 'Email já registado'});
    renderRegister();

    fillForm();
    fireEvent.press(screen.getAllByText(i18n.auth.createAccount)[1]);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        i18n.auth.registrationFailed,
        'Email já registado',
      );
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
