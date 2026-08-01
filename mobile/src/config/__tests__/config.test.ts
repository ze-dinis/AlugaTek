import {API_BASE_URL, API_ORIGIN, resolveApiAssetUrl} from '../index';

describe('config', () => {
  it('derives the API origin from the base url', () => {
    expect(API_BASE_URL.endsWith('/api')).toBe(true);
    expect(API_ORIGIN).toBe(API_BASE_URL.replace(/\/api$/, ''));
  });
});

describe('resolveApiAssetUrl', () => {
  it('returns undefined for empty values', () => {
    expect(resolveApiAssetUrl(undefined)).toBeUndefined();
    expect(resolveApiAssetUrl(null)).toBeUndefined();
    expect(resolveApiAssetUrl('')).toBeUndefined();
  });

  it('prefixes root-relative paths with the API origin', () => {
    expect(resolveApiAssetUrl('/uploads/photo.jpg')).toBe(
      `${API_ORIGIN}/uploads/photo.jpg`,
    );
  });

  it('prefixes bare relative paths with the API origin', () => {
    expect(resolveApiAssetUrl('uploads/photo.jpg')).toBe(
      `${API_ORIGIN}/uploads/photo.jpg`,
    );
  });

  it('rewrites absolute backend urls onto the current origin', () => {
    expect(resolveApiAssetUrl('http://10.0.2.2:5000/uploads/photo.jpg')).toBe(
      `${API_ORIGIN}/uploads/photo.jpg`,
    );
  });

  it('preserves the query string when rewriting', () => {
    expect(resolveApiAssetUrl('http://localhost:5000/uploads/photo.jpg?v=2')).toBe(
      `${API_ORIGIN}/uploads/photo.jpg?v=2`,
    );
  });

  it('leaves unrelated external urls untouched', () => {
    expect(resolveApiAssetUrl('https://cdn.example.com/img/photo.jpg')).toBe(
      'https://cdn.example.com/img/photo.jpg',
    );
  });

  it('returns malformed absolute urls unchanged', () => {
    expect(resolveApiAssetUrl('http://')).toBe('http://');
  });
});
