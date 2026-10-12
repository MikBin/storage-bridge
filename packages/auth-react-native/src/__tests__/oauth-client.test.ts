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

  describe('token-endpoint failure distinction (02-06)', () => {
    // bypass: fast-check not installed; deterministic token-endpoint case
    // matrix (network error / 500 / 400 invalid_grant / 401) across the login
    // and refresh exchange paths. Transport and 5xx failures must be
    // distinguishable from genuine auth rejections: only the latter may
    // request re-authentication.
    const NETWORK_ERROR = new TypeError('network request failed');

    function successPrompt(): void {
      mockPromptAsync.mockResolvedValueOnce({
        type: 'success',
        params: { code: 'native-auth-code', state: 'some-state' },
      });
    }

    function successTokenResponse(): void {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'native-access',
          refresh_token: 'native-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });
    }

    async function captureRejection(operation: Promise<unknown>): Promise<unknown> {
      try {
        await operation;
      } catch (error) {
        return error;
      }
      throw new Error('Expected the operation to reject, but it resolved');
    }

    async function coreErrors() {
      const core = await import('@storage-bridge/core');
      expect(core.AuthExchangeError).toBeTypeOf('function');
      return core;
    }

    function seedRefreshableTokens(): void {
      mockTokenStore.get.mockResolvedValue({
        accessToken: 'expired-token',
        refreshToken: 'refresh-123',
        expiresAt: Date.now() + 10_000,
        tokenType: 'Bearer',
      });
    }

    describe('transport failure (network error)', () => {
      it('login() rejects with AuthExchangeError chaining the network error', async () => {
        successPrompt();
        mockFetch.mockRejectedValueOnce(NETWORK_ERROR);

        const error = await captureRejection(client.login());
        const { AuthExchangeError } = await coreErrors();

        expect(error).toBeInstanceOf(AuthExchangeError);
        expect((error as { cause?: unknown }).cause).toBe(NETWORK_ERROR);
      });

      it('refreshTokens() rejects with AuthExchangeError and preserves stored tokens', async () => {
        seedRefreshableTokens();
        mockFetch.mockRejectedValueOnce(NETWORK_ERROR);

        const error = await captureRejection(client.getAccessToken());
        const { AuthExchangeError } = await coreErrors();

        expect(error).toBeInstanceOf(AuthExchangeError);
        expect((error as { cause?: unknown }).cause).toBe(NETWORK_ERROR);
        expect(mockTokenStore.remove).not.toHaveBeenCalled();
      });
    });

    describe('server failure (HTTP 500)', () => {
      it('login() rejects with AuthExchangeError whose cause carries status and body excerpt', async () => {
        successPrompt();
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => '{"error":"temporarily_unavailable","detail":"upstream down"}',
        });

        const error = await captureRejection(client.login());
        const { AuthExchangeError } = await coreErrors();

        expect(error).toBeInstanceOf(AuthExchangeError);
        const causeMessage = String((error as { cause?: { message?: string } }).cause?.message);
        expect(causeMessage).toContain('500');
        expect(causeMessage).toContain('upstream down');
      });

      it('refreshTokens() rejects with AuthExchangeError and preserves stored tokens', async () => {
        seedRefreshableTokens();
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => '{"error":"server_error"}',
        });

        const error = await captureRejection(client.getAccessToken());
        const { AuthExchangeError } = await coreErrors();

        expect(error).toBeInstanceOf(AuthExchangeError);
        expect(mockTokenStore.remove).not.toHaveBeenCalled();
      });
    });

    describe('genuine auth rejection', () => {
      it('login() with 400 invalid_grant rejects with AuthRequiredError', async () => {
        successPrompt();
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => '{"error":"invalid_grant","error_description":"Code was already redeemed."}',
        });

        const error = await captureRejection(client.login());
        expect(error).toBeInstanceOf(AuthRequiredError);
      });

      it('refreshTokens() with 400 invalid_grant clears tokens and rejects with AuthRequiredError', async () => {
        seedRefreshableTokens();
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => '{"error":"invalid_grant","error_description":"Refresh token expired"}',
        });

        const error = await captureRejection(client.getAccessToken());
        expect(error).toBeInstanceOf(AuthRequiredError);
        expect(mockTokenStore.remove).toHaveBeenCalledWith('google-drive');
      });

      it('refreshTokens() with 401 clears tokens and rejects with AuthRequiredError', async () => {
        seedRefreshableTokens();
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: async () => '{"error":"invalid_client"}',
        });

        const error = await captureRejection(client.getAccessToken());
        expect(error).toBeInstanceOf(AuthRequiredError);
        expect(mockTokenStore.remove).toHaveBeenCalledWith('google-drive');
      });
    });

    it('200 responses still exchange successfully on both paths (state-delta: happy path unchanged)', async () => {
      successPrompt();
      successTokenResponse();
      await client.login();
      expect(mockTokenStore.set).toHaveBeenCalledWith(
        'google-drive',
        expect.objectContaining({ accessToken: 'native-access' }),
      );

      seedRefreshableTokens();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'refreshed-native-token', expires_in: 3600, token_type: 'Bearer' }),
      });
      await expect(client.getAccessToken()).resolves.toBe('refreshed-native-token');
    });
  });
});
