import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserOAuthClient } from '../oauth-client.js';
import { LocalStorageTokenStore } from '../token-store.js';
import { savePendingState } from '../redirect-handler.js';
import type { OAuthProviderConfig, OAuthTokens, PendingAuthState } from '../types.js';
import { AuthRequiredError, PENDING_STATE_TTL_MS } from '@storage-bridge/core';

const mockConfig: OAuthProviderConfig = {
  providerId: 'google-drive',
  clientId: 'test-client-id',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  redirectUri: 'http://localhost:3000/callback',
  scopes: ['https://www.googleapis.com/auth/drive.appdata'],
};

/**
 * Fake of a token-endpoint 200 Response honoring the single-consumable-body
 * contract: the shared core TokenManager reads text() and parses, so the
 * double exposes the same bytes through both text() and json().
 */
function tokenEndpointBody(body: Record<string, unknown>): unknown {
  const payload = JSON.stringify(body);
  return {
    ok: true,
    text: async () => payload,
    json: async () => JSON.parse(payload) as unknown,
  };
}

describe('BrowserOAuthClient', () => {
  let client: BrowserOAuthClient;
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockTokenStore: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    mockTokenStore = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      remove: vi.fn(),
    };
    client = new BrowserOAuthClient({
      config: mockConfig,
      tokenStore: mockTokenStore as unknown as {
        get: (id: string) => Promise<OAuthTokens | null>;
        set: (id: string, tokens: OAuthTokens) => Promise<void>;
        remove: (id: string) => Promise<void>;
      },
      fetchFn: mockFetch as unknown as typeof fetch,
    });
  });

  describe('login()', () => {
    it('generates PKCE, saves state, and initiates redirect', async () => {
      const originalRandomUUID = crypto.randomUUID;
      crypto.randomUUID = () =>
        'test-state-uuid-test-state-uuid' as `${string}-${string}-${string}-${string}-${string}`;

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

      mockFetch.mockResolvedValueOnce(
        tokenEndpointBody({
          access_token: 'refreshed-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      );

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

      mockFetch.mockResolvedValueOnce(
        tokenEndpointBody({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      );

      await client.completeAuthFlow({ kind: 'callback', code: 'auth-code', state: 'test-state' });

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
      return client.completeAuthFlow({ kind: 'callback', code: 'auth-code', state: 'test-state' });
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
          text: async () =>
            '{"error":"invalid_grant","error_description":"Code was already redeemed."}',
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
      mockFetch.mockResolvedValueOnce(
        tokenEndpointBody({
          access_token: 'a1',
          refresh_token: 'r1',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      );
      await completeAuthFlowCall();
      expect(mockTokenStore.set).toHaveBeenCalledWith(
        'google-drive',
        expect.objectContaining({ accessToken: 'a1' }),
      );

      seedRefreshableTokens();
      mockFetch.mockResolvedValueOnce(
        tokenEndpointBody({ access_token: 'a2', expires_in: 3600, token_type: 'Bearer' }),
      );
      await expect(refreshCall()).resolves.toBe('a2');
    });
  });

  describe('completeAuthFlow() pending-state validation (03-04)', () => {
    // bypass: fast-check not installed; deterministic rejection matrix at the
    // consumption boundary (providerId mismatch, expired createdAt, unknown
    // state, stale-state replay, error callback, not-a-callback). Every
    // rejection path must leave the token endpoint untouched: validation
    // happens BEFORE the code exchange.
    async function captureRejection(operation: Promise<unknown>): Promise<unknown> {
      try {
        await operation;
      } catch (error) {
        return error;
      }
      throw new Error('Expected the operation to reject, but it resolved');
    }

    function seedPendingState(overrides: Partial<PendingAuthState> = {}): void {
      savePendingState({
        providerId: 'google-drive',
        codeVerifier: 'verifier-03-04',
        state: 'state-03-04',
        createdAt: Date.now(),
        ...overrides,
      });
    }

    function successResponse(): unknown {
      return tokenEndpointBody({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
      });
    }

    it('rejects a providerId mismatch without touching the token endpoint', async () => {
      seedPendingState({ providerId: 'dropbox', state: 'mismatch-state' });

      const error = await captureRejection(
        client.completeAuthFlow({ kind: 'callback', code: 'c', state: 'mismatch-state' }),
      );

      expect(error).toBeInstanceOf(AuthRequiredError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects an expired createdAt (past the 10-minute TTL) without touching the token endpoint', async () => {
      seedPendingState({
        state: 'expired-state',
        createdAt: Date.now() - PENDING_STATE_TTL_MS - 60_000,
      });

      const error = await captureRejection(
        client.completeAuthFlow({ kind: 'callback', code: 'c', state: 'expired-state' }),
      );

      expect(error).toBeInstanceOf(AuthRequiredError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('completes the exchange for a matching pending state within the TTL window', async () => {
      seedPendingState({
        state: 'fresh-state',
        createdAt: Date.now() - (PENDING_STATE_TTL_MS - 60_000),
      });
      mockFetch.mockResolvedValueOnce(successResponse());

      await expect(
        client.completeAuthFlow({ kind: 'callback', code: 'c', state: 'fresh-state' }),
      ).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockTokenStore.set).toHaveBeenCalledWith(
        'google-drive',
        expect.objectContaining({ accessToken: 'new-access' }),
      );
    });

    it('rejects an unknown state (never saved) without touching the token endpoint', async () => {
      const error = await captureRejection(
        client.completeAuthFlow({ kind: 'callback', code: 'c', state: 'never-saved' }),
      );

      expect(error).toBeInstanceOf(AuthRequiredError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('stale-state replay: the same state cannot complete login twice', async () => {
      seedPendingState();
      mockFetch.mockResolvedValueOnce(successResponse());

      await client.completeAuthFlow({ kind: 'callback', code: 'c1', state: 'state-03-04' });
      const replay = await captureRejection(
        client.completeAuthFlow({ kind: 'callback', code: 'c2', state: 'state-03-04' }),
      );

      expect(replay).toBeInstanceOf(AuthRequiredError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('rejects an error callback without touching the token endpoint', async () => {
      const error = await captureRejection(
        client.completeAuthFlow({
          kind: 'error',
          error: 'access_denied',
          error_description: 'User denied access',
        }),
      );

      expect(error).toBeInstanceOf(AuthRequiredError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects a null result (not a callback) without touching the token endpoint', async () => {
      const error = await captureRejection(client.completeAuthFlow(null));

      expect(error).toBeInstanceOf(AuthRequiredError);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('default token store — in-memory (03-01 / D1)', () => {
    // bypass: fast-check not installed; deterministic default-construction
    // matrix. D1: the default configuration must persist no token material
    // in localStorage, sessionStorage, or cookies (an XSS injection must not
    // exfiltrate long-lived refresh tokens); web-storage persistence remains
    // available only as explicit opt-in; after a reload simulation the fresh
    // default client surfaces AuthRequiredError (the re-auth signal) instead
    // of crashing, and a re-run of the flow restores a working session.

    const ACCESS = 'in-memory-access';
    const REFRESH = 'in-memory-refresh';

    function successExchange(): unknown {
      return tokenEndpointBody({
        access_token: ACCESS,
        refresh_token: REFRESH,
        expires_in: 3600,
        token_type: 'Bearer',
      });
    }

    function snapshot(storage: Storage): Record<string, string> {
      const contents: Record<string, string> = {};
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i) as string;
        contents[key] = storage.getItem(key) as string;
      }
      return contents;
    }

    function storageUniverse(): Record<string, string | Record<string, string>> {
      return {
        localStorage: snapshot(localStorage),
        sessionStorage: snapshot(sessionStorage),
        'document.cookie': document.cookie,
      };
    }

    function assertNoTokenMaterial(secrets: string[]): void {
      const universe = storageUniverse();
      const authKeys = [
        ...Object.keys(universe.localStorage as Record<string, string>),
        ...Object.keys(universe.sessionStorage as Record<string, string>),
      ].filter((key) => key.startsWith('sb_auth_'));
      expect(authKeys, 'no sb_auth_ keys may exist in web storage by default').toEqual([]);
      for (const slot of Object.keys(universe)) {
        for (const secret of secrets) {
          expect(String(universe[slot]), `slot ${slot} leaked token material`).not.toContain(
            secret,
          );
        }
      }
    }

    function defaultClient(): BrowserOAuthClient {
      return new BrowserOAuthClient({
        config: mockConfig,
        fetchFn: mockFetch as unknown as typeof fetch,
      });
    }

    function seedPendingState(state: string, verifier: string): void {
      savePendingState({
        providerId: 'google-drive',
        codeVerifier: verifier,
        state,
        createdAt: Date.now(),
      });
    }

    it('default construction + full auth lifecycle writes no token material to any storage global', async () => {
      localStorage.clear();
      sessionStorage.clear();
      document.cookie = '';

      const inMemoryClient = defaultClient();
      seedPendingState('state-d1', 'verifier-d1');
      mockFetch.mockResolvedValueOnce(successExchange());

      await inMemoryClient.completeAuthFlow({
        kind: 'callback',
        code: 'auth-code',
        state: 'state-d1',
      });
      await expect(inMemoryClient.getAccessToken()).resolves.toBe(ACCESS);
      await inMemoryClient.getAuthHeaders();

      // Mid-session (before logout can clean anything up): token material
      // exists ONLY in memory — no sb_auth_ keys, no persisted values, ever.
      assertNoTokenMaterial([ACCESS, REFRESH, 'verifier-d1']);

      await inMemoryClient.logout();
      assertNoTokenMaterial([ACCESS, REFRESH, 'verifier-d1']);
    });

    it('default client with no session rejects getAccessToken with AuthRequiredError and touches no storage', async () => {
      localStorage.clear();
      sessionStorage.clear();
      document.cookie = '';
      const before = storageUniverse();

      const freshClient = defaultClient();

      await expect(freshClient.getAccessToken()).rejects.toThrow(AuthRequiredError);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(storageUniverse()).toEqual(before);
    });

    it('explicit LocalStorageTokenStore opt-in still persists tokens to localStorage', async () => {
      localStorage.clear();
      sessionStorage.clear();

      const optInClient = new BrowserOAuthClient({
        config: mockConfig,
        tokenStore: new LocalStorageTokenStore(),
        fetchFn: mockFetch as unknown as typeof fetch,
      });
      seedPendingState('state-optin', 'verifier-optin');
      mockFetch.mockResolvedValueOnce(successExchange());

      await optInClient.completeAuthFlow({
        kind: 'callback',
        code: 'auth-code',
        state: 'state-optin',
      });

      const raw = localStorage.getItem('sb_auth_google-drive');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string)).toMatchObject({
        accessToken: ACCESS,
        refreshToken: REFRESH,
      });
    });

    it('post-reload simulation: fresh default client re-authenticates via the flow instead of crashing', async () => {
      localStorage.clear();
      sessionStorage.clear();
      document.cookie = '';
      const pristineStorage = storageUniverse();

      // Session before reload: tokens live only in this instance's memory.
      const beforeReload = defaultClient();
      seedPendingState('state-d1', 'verifier-d1');
      mockFetch.mockResolvedValueOnce(successExchange());
      await beforeReload.completeAuthFlow({
        kind: 'callback',
        code: 'auth-code',
        state: 'state-d1',
      });

      // Reload: a brand-new default client finds an empty store. It must
      // surface AuthRequiredError promptly — the consumer's re-auth signal —
      // without crashing and without a doomed refresh attempt (no stored
      // refresh token exists to attempt it with).
      const afterReload = defaultClient();
      await expect(afterReload.getAccessToken()).rejects.toThrow(AuthRequiredError);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Silent re-auth: the consumer re-runs login() (a redirect); the flow
      // completes on the reloaded client and tokens are usable again — with
      // still zero persistence across any storage global.
      seedPendingState('state-d1-reauth', 'verifier-d1-reauth');
      mockFetch.mockResolvedValueOnce(successExchange());
      await afterReload.completeAuthFlow({
        kind: 'callback',
        code: 'auth-code-2',
        state: 'state-d1-reauth',
      });
      await expect(afterReload.getAccessToken()).resolves.toBe(ACCESS);

      assertNoTokenMaterial([ACCESS, REFRESH, 'verifier-d1-reauth']);
      expect(storageUniverse()).toEqual(pristineStorage);
    });
  });
});
