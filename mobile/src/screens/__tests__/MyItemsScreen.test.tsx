import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import MyItemsScreen from '../Items/MyItemsScreen';
import {i18n} from '../../locales';
import {installHttpMock, HttpMock} from '../../testing/httpMock';

const mockNavigation = {navigate: jest.fn(), goBack: jest.fn()};

jest.mock('@react-navigation/native', () => {
  const actualReact = require('react');
  return {
    useNavigation: () => mockNavigation,
    useFocusEffect: (effect: () => void | (() => void)) =>
      actualReact.useEffect(effect, [effect]),
  };
});

const items = [
  {
    id: 'item-1',
    title: 'Canon EOS R5',
    description: 'Camera',
    district: 'Lisboa',
    localidade: 'Alvalade',
    dailyRate: 25,
    caucao: 100,
    imageUrl: '/uploads/canon.jpg',
    isAvailable: true,
    categoryName: 'Câmaras',
    owner: {id: 'user-1', name: 'Ana', email: 'ana@example.com'},
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'item-2',
    title: 'MacBook Pro',
    description: 'Portátil',
    district: 'Porto',
    dailyRate: 40,
    caucao: 500,
    isAvailable: false,
    categoryName: 'Portáteis',
    owner: {id: 'user-1', name: 'Ana', email: 'ana@example.com'},
    createdAt: '2026-01-02T00:00:00Z',
  },
];

describe('MyItemsScreen (integration)', () => {
  let http: HttpMock;

  beforeEach(() => {
    jest.clearAllMocks();
    http = installHttpMock();
  });

  afterEach(() => {
    http.restore();
  });

  it('loads and renders the current user listings', async () => {
    http.on('get', '/items/my', 200, items);
    render(<MyItemsScreen />);

    expect(await screen.findByText('Canon EOS R5')).toBeTruthy();
    expect(screen.getByText('MacBook Pro')).toBeTruthy();
    expect(screen.getByText('💶 25.00€/dia')).toBeTruthy();
    expect(screen.getByText('📍 Alvalade, Lisboa')).toBeTruthy();
    expect(screen.getByText('📍 Porto')).toBeTruthy();
    expect(http.requestsTo('get', '/items/my')).toHaveLength(1);
  });

  it('renders availability badges from the API payload', async () => {
    http.on('get', '/items/my', 200, items);
    render(<MyItemsScreen />);

    expect(
      await screen.findByText(`✅ ${i18n.myAdvertisements.available}`),
    ).toBeTruthy();
    expect(screen.getByText(`✅ ${i18n.myAdvertisements.unavailable}`)).toBeTruthy();
  });

  it('navigates to the detail and edit screens', async () => {
    http.on('get', '/items/my', 200, items);
    render(<MyItemsScreen />);

    fireEvent.press(await screen.findByText('Canon EOS R5'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ItemDetail', {itemId: 'item-1'});

    fireEvent.press(screen.getAllByText(`✏️ ${i18n.myAdvertisements.edit}`)[0]);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('EditItem', {itemId: 'item-1'});
  });

  it('shows the empty state when the user has no listings', async () => {
    http.on('get', '/items/my', 200, []);
    render(<MyItemsScreen />);

    expect(await screen.findByText(i18n.myAdvertisements.noItems)).toBeTruthy();
  });

  it('falls back to the backend error view and retries on demand', async () => {
    http.onNetworkError('get', '/items/my');
    render(<MyItemsScreen />);

    const retry = await screen.findByText(i18n.common.retry);
    expect(screen.getByText(i18n.common.backendUnavailable)).toBeTruthy();

    fireEvent.press(retry);

    await waitFor(() => {
      expect(http.requestsTo('get', '/items/my').length).toBeGreaterThan(1);
    });
  });
});
