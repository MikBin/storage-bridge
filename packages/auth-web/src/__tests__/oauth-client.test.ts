import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserOAuthClient } from '../oauth-client.js';
import type { OAuthProviderConfig, OAuthTokens } from '../types.js';
import { AuthRequiredError } from '@storage-bridge/core';

const mockConfig: OAuthProviderConfig = {
  providerId: 'google-drive',
  clientId: 'test-client-id',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  redirectUri: 'http://localhost:3000/callback',
  scopes: ['https://www.googleapis.com/auth/drive.appdata'],
};

describe('BrowserOAuthClient', () => {
  let client: BrowserOAuthClient;
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockTokenStore: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockFetch = vi.fn();
    mockTokenStore = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      remove: vi.fn(),
    };
    client = new BrowserOAuthClient({
      config: mockConfig,
      tokenStore: mockTokenStore as unknown as { get: (id: string) => Promise<OAuthTokens | null>, set: (id: string, tokens: OAuthTokens) => Promise<void>, remove: (id: string) => Promise<void> },
      fetchFn: mockFetch as unknown as typeof fetch,
    });
  });

  describe('login()', () => {
    it('generates PKCE, saves state, and initiates redirect', async () => {
      const originalRandomUUID = crypto.randomUUID;
      crypto.randomUUID = () => 'test-state-uuid-test-state-uuid' as `${string}-${string}-${string}-${string}-${string}`;

      const mockAssign = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { assign: mockAssign, search: '', href: '' },
        writable: true,
      });

      try {
        await client.login();
      } catch {
        // Expected
      }

      expect(mockAssign).toHaveBeenCalled();
      const authUrl = mockAssign.mock.calls[0][0] as string;
      expect(authUrl).toContain('code_challenge_method=S256');
      expect(authUrl).toContain('client_id=test-client-id');
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain('state=test-state-uuid');

      crypto.randomUUID = originalRandomUUID;
    });
  });

  describe('getAccessToken()', () => {
    it('throws AuthRequiredError when no tokens', async () => {
      mockTokenStore.get.mockReturnValue(null);
      await expect(client.getAccessToken()).rejects.toThrow(AuthRequiredError);
    });

    it('returns stored token when valid', async () => {
      mockTokenStore.get.mockReturnValue({
        accessToken: 'valid-token',
        expiresAt: Date.now() + 3600000,
      });
      const token = await client.getAccessToken();
      expect(token).toBe('valid-token');
    });

    it('auto-refreshes when token is near expiry', async () => {
      mockTokenStore.get
        .mockReturnValueOnce({
          accessToken: 'expired-token',
          refreshToken: 'refresh-123',
          expiresAt: Date.now() + 30000,
          tokenType: 'Bearer',
        })
        .mockReturnValueOnce({
          accessToken: 'expired-token',
          refreshToken: 'refresh-123',
          expiresAt: Date.now() + 30000,
          tokenType: 'Bearer',
        });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      const token = await client.getAccessToken();
      expect(token).toBe('refreshed-token');
      expect(mockFetch).toHaveBeenCalledWith(
        mockConfig.tokenEndpoint,
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getAuthHeaders()', () => {
    it('returns Bearer authorization header', async () => {
      mockTokenStore.get.mockReturnValue({
        accessToken: 'my-token',
        expiresAt: Date.now() + 3600000,
      });
      const headers = await client.getAuthHeaders();
      expect(headers).toEqual({ Authorization: 'Bearer my-token' });
    });
  });

  describe('logout()', () => {
    it('clears stored tokens', async () => {
      await client.logout();
      expect(mockTokenStore.remove).toHaveBeenCalledWith('google-drive');
    });
  });

  describe('completeAuthFlow()', () => {
    it('exchanges code for tokens and stores them', async () => {
      const { savePendingState } = await import('../redirect-handler.js');
      const verifier = 'test-verifier';
      savePendingState({
        providerId: 'google-drive',
        codeVerifier: verifier,
        state: 'test-state',
        createdAt: Date.now(),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      await client.completeAuthFlow({ success: true, code: 'auth-code', state: 'test-state' });

      expect(mockFetch).toHaveBeenCalledWith(
        mockConfig.tokenEndpoint,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      const callBody = mockFetch.mock.calls[0][1].body as string;
      expect(callBody).toContain('grant_type=authorization_code');
      expect(callBody).toContain('code=auth-code');
      expect(callBody).toContain(`code_verifier=${verifier}`);

      expect(mockTokenStore.set).toHaveBeenCalledWith(
        'google-drive',
        expect.objectContaining({
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
        }),
      );
    });
  });

  describe('token-endpoint failure distinction (02-06)', () => {
    // bypass: fast-check not installed; deterministic token-endpoint case
    // matrix (network error / 500 / 400 invalid_grant / 403) across both
    // exchange paths. Transport and 5xx failures must be distinguishable from
    // genuine auth rejections: only the latter may request re-authentication.
    const NETWORK_ERROR = new TypeError('fetch failed');

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

    function mockPendingState(): Promise<void> {
      return import('../redirect-handler.js').then(({ savePendingState }) => {
        savePendingState({
          providerId: 'google-drive',
          codeVerifier: 'verifier',
          state: 'test-state',
          createdAt: Date.now(),
        });
      });
    }

    function completeAuthFlowCall(): Promise<unknown> {
      return client.completeAuthFlow({ success: true, code: 'auth-code', state: 'test-state' });
    }

    function seedRefreshableTokens(): void {
      mockTokenStore.get.mockReturnValue({
        accessToken: 'expired-token',
        refreshToken: 'refresh-123',
        expiresAt: Date.now() + 10_000,
        tokenType: 'Bearer',
      });
    }

    function refreshCall(): Promise<unknown> {
      return client.getAccessToken();
    }

    describe('transport failure (network error)', () => {
      it('completeAuthFlow() rejects with AuthExchangeError chaining the network error', async () => {
        await mockPendingState();
        mockFetch.mockRejectedValueOnce(NETWORK_ERROR);

        const error = await captureRejection(completeAuthFlowCall());
        const { AuthExchangeError } = await coreErrors();

        expect(error).toBeInstanceOf(AuthExchangeError);
        expect((error as { cause?: unknown }).cause).toBe(NETWORK_ERROR);
      });

      it('refreshTokens() rejects with AuthExchangeError and preserves stored tokens', async () => {
        seedRefreshableTokens();
        mockFetch.mockRejectedValueOnce(NETWORK_ERROR);

        const error = await captureRejection(refreshCall());
        const { AuthExchangeError } = await coreErrors();

        expect(error).toBeInstanceOf(AuthExchangeError);
        expect((error as { cause?: unknown }).cause).toBe(NETWORK_ERROR);
        expect(mockTokenStore.remove).not.toHaveBeenCalled();
      });
    });

    describe('server failure (HTTP 500)', () => {
      it('completeAuthFlow() rejects with AuthExchangeError whose cause carries status and body excerpt', async () => {
        await mockPendingState();
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => '{"error":"temporarily_unavailable","detail":"upstream down"}',
        });

        const error = await captureRejection(completeAuthFlowCall());
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

        const error = await captureRejection(refreshCall());
        const { AuthExchangeError } = await coreErrors();

        expect(error).toBeInstanceOf(AuthExchangeError);
        expect(mockTokenStore.remove).not.toHaveBeenCalled();
      });
    });

    describe('genuine auth rejection', () => {
      it('completeAuthFlow() with 400 invalid_grant rejects with AuthRequiredError', async () => {
        await mockPendingState();
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => '{"error":"invalid_grant","error_description":"Code was already redeemed."}',
        });

        const error = await captureRejection(completeAuthFlowCall());
        expect(error).toBeInstanceOf(AuthRequiredError);
      });

      it('completeAuthFlow() with 403 rejects with AuthRequiredError', async () => {
        await mockPendingState();
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          text: async () => 'forbidden',
        });

        const error = await captureRejection(completeAuthFlowCall());
        expect(error).toBeInstanceOf(AuthRequiredError);
      });

      it('refreshTokens() with 400 invalid_grant clears tokens and rejects with AuthRequiredError', async () => {
        seedRefreshableTokens();
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => '{"error":"invalid_grant","error_description":"Refresh token expired"}',
        });

        const error = await captureRejection(refreshCall());
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

        const error = await captureRejection(refreshCall());
        expect(error).toBeInstanceOf(AuthRequiredError);
        expect(mockTokenStore.remove).toHaveBeenCalledWith('google-drive');
      });
    });

    it('200 responses still exchange successfully on both paths (state-delta: happy path unchanged)', async () => {
      await mockPendingState();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'a1', refresh_token: 'r1', expires_in: 3600, token_type: 'Bearer' }),
      });
      await completeAuthFlowCall();
      expect(mockTokenStore.set).toHaveBeenCalledWith('google-drive', expect.objectContaining({ accessToken: 'a1' }));

      seedRefreshableTokens();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'a2', expires_in: 3600, token_type: 'Bearer' }),
      });
      await expect(refreshCall()).resolves.toBe('a2');
    });
  });
});
