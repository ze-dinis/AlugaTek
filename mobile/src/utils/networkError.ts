import axios from 'axios';

export function isBackendCommunicationError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  return !error.response;
}
