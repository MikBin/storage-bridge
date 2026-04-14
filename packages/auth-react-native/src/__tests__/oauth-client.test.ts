import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactNativeOAuthClient } from '../oauth-client.js';
import type { ReactNativeOAuthConfig } from '../types.js';
import { AuthRequiredError } from '@storage-bridge/core';
import type { OAuthTokens } from '@storage-bridge/auth-web';

const mockConfig: ReactNativeOAuthConfig = {
  providerId: 'google-drive',
  clientId: 'native-client-id',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  redirectUri: 'myapp://oauth/callback',
};

const mockPromptAsync = vi.fn();

vi.mock('expo-auth-session', () => {
  return {
    AuthRequest: class {
      codeVerifier = 'mock-verifier';
      promptAsync = mockPromptAsync;
    }
  };
});

describe('ReactNativeOAuthClient', () => {
  let client: ReactNativeOAuthClient;
  let mockTokenStore: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPromptAsync.mockReset();
    mockTokenStore = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    mockFetch = vi.fn() as unknown as ReturnType<typeof vi.fn>;
    client = new ReactNativeOAuthClient({
      config: mockConfig,
      tokenStore: mockTokenStore as unknown as { get: (id: string) => Promise<OAuthTokens | null>, set: (id: string, tokens: OAuthTokens) => Promise<void>, remove: (id: string) => Promise<void> },
      fetchFn: mockFetch as unknown as typeof fetch,
    });
  });

  describe('login()', () => {
    it('calls AuthRequest.promptAsync and exchanges code for tokens', async () => {
      mockPromptAsync.mockResolvedValueOnce({
        type: 'success',
        params: { code: 'native-auth-code', state: 'some-state' },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'native-access',
          refresh_token: 'native-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      await client.login();

      expect(mockPromptAsync).toHaveBeenCalledWith({
        authorizationEndpoint: mockConfig.authorizationEndpoint,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        mockConfig.tokenEndpoint,
        expect.objectContaining({ method: 'POST' }),
      );

      expect(mockTokenStore.set).toHaveBeenCalledWith(
        'google-drive',
        expect.objectContaining({
          accessToken: 'native-access',
          refreshToken: 'native-refresh',
        }),
      );
    });

    it('throws AuthRequiredError on user cancel', async () => {
      mockPromptAsync.mockResolvedValueOnce({
        type: 'cancel',
      });

      await expect(client.login()).rejects.toThrow(AuthRequiredError);
    });

    it('throws AuthRequiredError on auth error', async () => {
      mockPromptAsync.mockResolvedValueOnce({
        type: 'error',
        errorCode: 'access_denied',
      });

      await expect(client.login()).rejects.toThrow(AuthRequiredError);
    });
  });

  describe('getAccessToken()', () => {
    it('throws AuthRequiredError when no tokens', async () => {
      mockTokenStore.get.mockResolvedValueOnce(null);
      await expect(client.getAccessToken()).rejects.toThrow(AuthRequiredError);
    });

    it('returns stored token when valid', async () => {
      mockTokenStore.get.mockResolvedValueOnce({
        accessToken: 'valid-native-token',
        expiresAt: Date.now() + 3600000,
      });
      const token = await client.getAccessToken();
      expect(token).toBe('valid-native-token');
    });

    it('auto-refreshes expired token', async () => {
      mockTokenStore.get
        .mockResolvedValueOnce({
          accessToken: 'expired-token',
          refreshToken: 'refresh-123',
          expiresAt: Date.now() + 30000,
          tokenType: 'Bearer',
        })
        .mockResolvedValueOnce({
          accessToken: 'expired-token',
          refreshToken: 'refresh-123',
          expiresAt: Date.now() + 30000,
          tokenType: 'Bearer',
        });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-native-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      const token = await client.getAccessToken();
      expect(token).toBe('refreshed-native-token');
    });
  });

  describe('getAuthHeaders()', () => {
    it('returns Bearer authorization header', async () => {
      mockTokenStore.get.mockResolvedValueOnce({
        accessToken: 'native-bearer-token',
        expiresAt: Date.now() + 3600000,
      });
      const headers = await client.getAuthHeaders();
      expect(headers).toEqual({ Authorization: 'Bearer native-bearer-token' });
    });
  });

  describe('logout()', () => {
    it('clears stored tokens', async () => {
      await client.logout();
      expect(mockTokenStore.remove).toHaveBeenCalledWith('google-drive');
    });
  });
});
