import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageTokenStore, SessionStorageTokenStore } from '../token-store.js';
import type { OAuthTokens } from '../types.js';

const sampleTokens: OAuthTokens = {
  accessToken: 'access-123',
  refreshToken: 'refresh-456',
  expiresAt: Date.now() + 3600000,
  tokenType: 'Bearer',
};

describe('LocalStorageTokenStore', () => {
  let store: LocalStorageTokenStore;

  beforeEach(() => {
    localStorage.clear();
    store = new LocalStorageTokenStore();
  });

  it('returns null for missing provider', () => {
    expect(store.get('google-drive')).toBeNull();
  });

  it('stores and retrieves tokens by providerId', () => {
    store.set('google-drive', sampleTokens);
    const retrieved = store.get('google-drive');
    expect(retrieved).toEqual(sampleTokens);
  });

  it('removes tokens for specific provider', () => {
    store.set('google-drive', sampleTokens);
    store.remove('google-drive');
    expect(store.get('google-drive')).toBeNull();
  });

  it('namespaced keys do not collide across providers', () => {
    const dropboxTokens: OAuthTokens = { accessToken: 'dropbox-access' };
    store.set('google-drive', sampleTokens);
    store.set('dropbox', dropboxTokens);
    expect(store.get('google-drive')).toEqual(sampleTokens);
    expect(store.get('dropbox')).toEqual(dropboxTokens);
  });
});

describe('SessionStorageTokenStore', () => {
  let store: SessionStorageTokenStore;

  beforeEach(() => {
    sessionStorage.clear();
    store = new SessionStorageTokenStore();
  });

  it('returns null for missing provider', () => {
    expect(store.get('onedrive')).toBeNull();
  });

  it('stores and retrieves tokens by providerId', () => {
    store.set('onedrive', sampleTokens);
    const retrieved = store.get('onedrive');
    expect(retrieved).toEqual(sampleTokens);
  });

  it('removes tokens for specific provider', () => {
    store.set('onedrive', sampleTokens);
    store.remove('onedrive');
    expect(store.get('onedrive')).toBeNull();
  });
});
