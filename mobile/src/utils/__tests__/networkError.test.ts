import {AxiosError, AxiosHeaders} from 'axios';
import {isBackendCommunicationError} from '../networkError';

function axiosError(response?: {status: number}): AxiosError {
  const error = new AxiosError('boom', 'ERR', {
    headers: new AxiosHeaders(),
  });

  if (response) {
    error.response = {
      status: response.status,
      statusText: '',
      data: {},
      headers: {},
      config: {headers: new AxiosHeaders()},
    } as AxiosError['response'];
  }

  return error;
}

describe('isBackendCommunicationError', () => {
  it('is true when the request never reached the backend', () => {
    expect(isBackendCommunicationError(axiosError())).toBe(true);
  });

  it('is false when the backend answered, even with an error status', () => {
    expect(isBackendCommunicationError(axiosError({status: 500}))).toBe(false);
    expect(isBackendCommunicationError(axiosError({status: 401}))).toBe(false);
  });

  it.each([new Error('plain'), 'string error', null, undefined, {}])(
    'is false for non-axios error %p',
    error => {
      expect(isBackendCommunicationError(error)).toBe(false);
    },
  );
});
