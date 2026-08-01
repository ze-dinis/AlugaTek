import api from '../api';
import {authService} from '../authService';
import {chatService} from '../chatService';
import {itemsService} from '../itemsService';
import {rentalReviewsService} from '../rentalReviewsService';
import {rentalsService} from '../rentalsService';
import {usersService} from '../usersService';
import {payoutPreferenceService} from '../payoutPreferenceService';

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.resolve({data: {}})),
    post: jest.fn(() => Promise.resolve({data: {}})),
    put: jest.fn(() => Promise.resolve({data: {}})),
    patch: jest.fn(() => Promise.resolve({data: {}})),
    delete: jest.fn(() => Promise.resolve({data: {}})),
  },
}));

const mockedApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authService', () => {
  it('registers with the credentials payload', async () => {
    await authService.register('Ana', 'ana@example.com', 'Password123!');

    expect(mockedApi.post).toHaveBeenCalledWith('/auth/register', {
      name: 'Ana',
      email: 'ana@example.com',
      password: 'Password123!',
    });
  });

  it('logs in with email and password', async () => {
    await authService.login('ana@example.com', 'Password123!');

    expect(mockedApi.post).toHaveBeenCalledWith('/auth/login', {
      email: 'ana@example.com',
      password: 'Password123!',
    });
  });

  it('sends the Google ID token as a raw JSON string', async () => {
    await authService.googleOAuth('google-id-token');

    expect(mockedApi.post).toHaveBeenCalledWith(
      '/auth/oauth/google',
      JSON.stringify('google-id-token'),
      {headers: {'Content-Type': 'application/json'}},
    );
  });
});

describe('itemsService', () => {
  it('forwards list filters as query params', async () => {
    await itemsService.getAll({categoryId: 2, search: 'canon', district: 'Lisboa'});

    expect(mockedApi.get).toHaveBeenCalledWith('/items', {
      params: {categoryId: 2, search: 'canon', district: 'Lisboa'},
    });
  });

  it('reads a single item by id', async () => {
    await itemsService.getById('item-1');

    expect(mockedApi.get).toHaveBeenCalledWith('/items/item-1');
  });

  it('toggles favorites through the dedicated endpoints', async () => {
    await itemsService.addFavorite('item-1');
    await itemsService.removeFavorite('item-1');

    expect(mockedApi.post).toHaveBeenCalledWith('/items/item-1/favorite');
    expect(mockedApi.delete).toHaveBeenCalledWith('/items/item-1/favorite');
  });

  it('creates an item as multipart form data', async () => {
    await itemsService.create({
      title: 'Canon EOS R5',
      description: 'Camera',
      district: 'Lisboa',
      localidade: '  Alvalade  ',
      dailyRate: 25,
      caucao: 100,
      categoryId: 3,
      images: [{uri: 'file:///photo.jpg'}],
    });

    const [url, body, config] = mockedApi.post.mock.calls[0];
    expect(url).toBe('/items/upload');
    expect(config?.headers).toEqual({'Content-Type': 'multipart/form-data'});
    expect(body).toBeInstanceOf(FormData);
  });

  it('skips images without a uri when creating an item', async () => {
    await itemsService.create({
      title: 'Canon',
      description: 'Camera',
      district: 'Lisboa',
      dailyRate: 10,
      caucao: 50,
      categoryId: 3,
      images: [{uri: ''}],
    });

    expect(mockedApi.post).toHaveBeenCalledTimes(1);
  });

  it('uploads a single image as multipart form data', async () => {
    await itemsService.uploadImage({uri: 'file:///photo.jpg'});

    const [url, body, config] = mockedApi.post.mock.calls[0];
    expect(url).toBe('/items/upload-image');
    expect(body).toBeInstanceOf(FormData);
    expect(config?.headers).toEqual({'Content-Type': 'multipart/form-data'});
  });

  it('uploads multiple images in a single request', async () => {
    await itemsService.uploadImages([
      {uri: 'file:///a.jpg'},
      {uri: 'file:///b.jpg', name: 'b.png', type: 'image/png'},
    ]);

    const [url, body] = mockedApi.post.mock.calls[0];
    expect(url).toBe('/items/upload-images');
    expect(body).toBeInstanceOf(FormData);
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
  });

  it('updates and deletes an item by id', async () => {
    const payload = {
      title: 'Canon',
      description: 'Camera',
      district: 'Porto',
      dailyRate: 12,
      caucao: 60,
      isAvailable: false,
    };

    await itemsService.update('item-1', payload);
    await itemsService.delete('item-1');

    expect(mockedApi.put).toHaveBeenCalledWith('/items/item-1', payload);
    expect(mockedApi.delete).toHaveBeenCalledWith('/items/item-1');
  });

  it('reports a user for a listing', async () => {
    await itemsService.reportUser('user-1', 'item-1', 'Fraud');

    expect(mockedApi.post).toHaveBeenCalledWith('/reports', {
      reportedUserId: 'user-1',
      itemId: 'item-1',
      reason: 'Fraud',
    });
  });
});

describe('rentalsService', () => {
  it('creates a rental request', async () => {
    await rentalsService.create('item-1', '2026-01-01', '2026-01-03');

    expect(mockedApi.post).toHaveBeenCalledWith('/rentals', {
      itemId: 'item-1',
      startDate: '2026-01-01',
      endDate: '2026-01-03',
    });
  });

  it('confirms a rental with the payout destination', async () => {
    await rentalsService.confirm('rental-1', 'IBAN PT50 0002');

    expect(mockedApi.patch).toHaveBeenCalledWith('/rentals/rental-1/confirm', {
      paymentDescription: 'IBAN PT50 0002',
    });
  });

  it('attaches the stored payout preference when paying', async () => {
    jest
      .spyOn(payoutPreferenceService, 'getPaymentDescription')
      .mockResolvedValue('MB WAY +351912345678');

    await rentalsService.pay('rental-1', 'pm_card_visa');

    expect(mockedApi.patch).toHaveBeenCalledWith('/rentals/rental-1/pay', {
      paymentMethodId: 'pm_card_visa',
      paymentDescription: 'MB WAY +351912345678',
    });
  });

  it('attaches the stored payout preference when renewing', async () => {
    jest
      .spyOn(payoutPreferenceService, 'getPaymentDescription')
      .mockResolvedValue(null);

    await rentalsService.renew('rental-1', 2, 'pm_card_visa');

    expect(mockedApi.patch).toHaveBeenCalledWith('/rentals/rental-1/renew', {
      extraDays: 2,
      paymentMethodId: 'pm_card_visa',
      paymentDescription: null,
    });
  });

  it('requests a renewal quote with the extra days', async () => {
    await rentalsService.getRenewQuote('rental-1', 3);

    expect(mockedApi.get).toHaveBeenCalledWith('/rentals/rental-1/renew-quote', {
      params: {extraDays: 3},
    });
  });

  it('drives the return lifecycle endpoints', async () => {
    await rentalsService.returnRental('rental-1');
    await rentalsService.confirmReturn('rental-1');
    await rentalsService.declineReturn('rental-1');
    await rentalsService.cancel('rental-1');
    await rentalsService.decline('rental-1');

    expect(mockedApi.patch.mock.calls.map(call => call[0])).toEqual([
      '/rentals/rental-1/return',
      '/rentals/rental-1/confirm-return',
      '/rentals/rental-1/decline-return',
      '/rentals/rental-1/cancel',
      '/rentals/rental-1/decline',
    ]);
  });

  it('opens a dispute with reason and description', async () => {
    await rentalsService.openDispute('rental-1', {
      reason: 'Damage',
      description: 'Scratched lens',
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/rentals/rental-1/dispute', {
      reason: 'Damage',
      description: 'Scratched lens',
    });
  });
});

describe('usersService', () => {
  it('reads the public rating summary', async () => {
    await usersService.getRentalRating('user-1');

    expect(mockedApi.get).toHaveBeenCalledWith('/users/user-1/rental-rating');
  });

  it('forwards paging and sorting options for reviews', async () => {
    await usersService.getRentalReviews('user-1', {limit: 10, skip: 20, sort: 'highest'});

    expect(mockedApi.get).toHaveBeenCalledWith('/users/user-1/rental-reviews', {
      params: {limit: 10, skip: 20, sort: 'highest'},
    });
  });
});

describe('chatService', () => {
  it('lists conversations', async () => {
    await chatService.getConversations();

    expect(mockedApi.get).toHaveBeenCalledWith('/chat/conversations');
  });

  it('reads a thread scoped to the other participant', async () => {
    await chatService.getMessages('item-1', 'user-2');

    expect(mockedApi.get).toHaveBeenCalledWith('/chat/item-1', {
      params: {otherUserId: 'user-2'},
    });
  });

  it('sends a message with optional images', async () => {
    await chatService.sendMessage('item-1', 'Hello', 'user-2', ['/uploads/a.jpg']);

    expect(mockedApi.post).toHaveBeenCalledWith('/chat', {
      itemId: 'item-1',
      content: 'Hello',
      receiverId: 'user-2',
      imageUrls: ['/uploads/a.jpg'],
    });
  });
});

describe('rentalReviewsService', () => {
  it('submits a review', async () => {
    await rentalReviewsService.create('rental-1', 5, 'Great');

    expect(mockedApi.post).toHaveBeenCalledWith('/rental-reviews', {
      rentalId: 'rental-1',
      rating: 5,
      comment: 'Great',
    });
  });

  it('checks review eligibility for a rental', async () => {
    await rentalReviewsService.getEligibility('rental-1');

    expect(mockedApi.get).toHaveBeenCalledWith(
      '/rental-reviews/rental/rental-1/eligibility',
    );
  });
});
