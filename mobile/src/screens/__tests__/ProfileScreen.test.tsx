import React from 'react';
import {Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import ProfileScreen from '../Profile/ProfileScreen';
import {useAuthStore} from '../../store/authStore';
import {i18n} from '../../locales';
import {installHttpMock, HttpMock} from '../../testing/httpMock';

const mockNavigation = {navigate: jest.fn(), goBack: jest.fn()};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));

const user = {id: 'user-1', name: 'Ana Silva', email: 'ana@example.com'};

/** Renders and lets the profile's rating/review effects settle. */
async function renderProfile() {
  const utils = render(<ProfileScreen />);
  await waitFor(() => {
    expect(screen.getByText(i18n.profile.reviewCommentsTitle)).toBeTruthy();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

describe('ProfileScreen (integration)', () => {
  let http: HttpMock;
  let alertSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    http = installHttpMock();
    http.on('get', `/users/${user.id}/rental-rating`, 200, {
      userId: user.id,
      averageRating: 4.5,
      reviewCount: 2,
    });
    http.on('get', `/users/${user.id}/rental-reviews`, 200, []);
    http.on('post', '/notifications/device-token/unregister', 200);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useAuthStore.setState({user, token: 'jwt-token', isLoading: false});
  });

  afterEach(() => {
    http.restore();
    alertSpy.mockRestore();
  });

  it('renders the signed-in profile and its rating summary', async () => {
    await renderProfile();

    expect(screen.getByText('Ana Silva')).toBeTruthy();
    expect(screen.getByText('ana@example.com')).toBeTruthy();
    expect(await screen.findByText(/4\.5/)).toBeTruthy();
    expect(screen.getByText(i18n.profile.noReviewComments)).toBeTruthy();
  });

  it('requests the rating and review feeds for the signed-in user', async () => {
    await renderProfile();

    await waitFor(() => {
      expect(http.requestsTo('get', `/users/${user.id}/rental-rating`)).toHaveLength(1);
    });
    expect(http.requestsTo('get', `/users/${user.id}/rental-reviews`)[0]).toMatchObject({
      params: {limit: 20, sort: 'recent'},
    });
  });

  it('persists a valid IBAN payout destination', async () => {
    await renderProfile();

    fireEvent.press(screen.getByText(i18n.profile.addIbanMbway));
    fireEvent.changeText(
      screen.getByPlaceholderText(i18n.profile.ibanMbwayPlaceholder),
      'PT50000201231234567890154',
    );
    fireEvent.press(screen.getByText(i18n.common.ok));

    await waitFor(async () => {
      await expect(AsyncStorage.getItem('payout_description')).resolves.toBe(
        'IBAN PT50 0002 0123 1234 5678 9015 4',
      );
    });
    expect(
      screen.getByText('IBAN PT50 0002 0123 1234 5678 9015 4'),
    ).toBeTruthy();
  });

  it('rejects an invalid payout destination and stores nothing', async () => {
    await renderProfile();

    fireEvent.press(screen.getByText(i18n.profile.addIbanMbway));
    fireEvent.changeText(
      screen.getByPlaceholderText(i18n.profile.ibanMbwayPlaceholder),
      'PT50000000000000000000000',
    );
    fireEvent.press(screen.getByText(i18n.common.ok));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        i18n.common.error,
        i18n.profile.invalidIbanMbway,
      );
    });
    await expect(AsyncStorage.getItem('payout_description')).resolves.toBeNull();
  });

  it('rehydrates a previously saved payout destination', async () => {
    await AsyncStorage.setItem('payout_description', 'MB WAY +351912345678');

    await renderProfile();

    expect(await screen.findByText('MB WAY +351912345678')).toBeTruthy();
  });

  it('clears the session when the user confirms sign-out', async () => {
    await AsyncStorage.setItem('auth_token', 'jwt-token');
    await renderProfile();

    fireEvent.press(screen.getAllByText(i18n.profile.signOut)[0]);

    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void | Promise<void>;
    }>;
    await act(async () => {
      await buttons.find(b => b.text === i18n.profile.signOut)?.onPress?.();
    });

    await waitFor(() => {
      expect(useAuthStore.getState().token).toBeNull();
    });
    await expect(AsyncStorage.getItem('auth_token')).resolves.toBeNull();
  });

  it('navigates to the owned listings and favorites', async () => {
    await renderProfile();

    fireEvent.press(screen.getByText(i18n.navigation.myItems));
    fireEvent.press(screen.getByText(i18n.navigation.myFavorites));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('MyItems');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MyFavorites');
  });
});
