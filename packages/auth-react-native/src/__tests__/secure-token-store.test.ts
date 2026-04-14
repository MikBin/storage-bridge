import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecureTokenStore } from '../secure-token-store.js';
import type { OAuthTokens } from '@storage-bridge/auth-web';

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

import * as SecureStore from 'expo-secure-store';

const sampleTokens: OAuthTokens = {
  accessToken: 'native-access-123',
  refreshToken: 'native-refresh-456',
  expiresAt: Date.now() + 3600000,
  tokenType: 'Bearer',
};

describe('SecureTokenStore', () => {
  let store: SecureTokenStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new SecureTokenStore();
  });

  it('returns null for missing provider', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
    const result = await store.get('google-drive');
    expect(result).toBeNull();
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('sb_auth_google-drive');
  });

  it('stores and retrieves tokens by providerId', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify(sampleTokens));
    const result = await store.get('google-drive');
    expect(result).toEqual(sampleTokens);
  });

  it('calls setItemAsync with JSON-serialized tokens', async () => {
    await store.set('google-drive', sampleTokens);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'sb_auth_google-drive',
      JSON.stringify(sampleTokens),
    );
  });

  it('removes tokens for specific provider', async () => {
    await store.remove('google-drive');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('sb_auth_google-drive');
  });

  it('namespaced keys do not collide across providers', async () => {
    await store.set('google-drive', sampleTokens);
    await store.set('dropbox', { accessToken: 'dropbox-token' });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'sb_auth_google-drive',
      expect.any(String),
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'sb_auth_dropbox',
      expect.any(String),
    );
  });

  it('returns null for corrupted stored data', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('not-valid-json');
    const result = await store.get('google-drive');
    expect(result).toBeNull();
  });
});
