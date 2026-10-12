// bypass: fast-check not installed; deterministic case matrix over the
// token-state universe {access, refresh, expiry} with injected fake
// store/fetch/clock. The same lifecycle matrix runs against sync-backed and
// async-backed store adapters (03-03): the web and react-native runtimes must
// differ only in the adapters they supply to the shared TokenManager.
import { describe, it, expect, vi } from 'vitest';
import * as oauth from '../oauth.js';
import { AuthRequiredError, AuthExchangeError } from '../errors.js';
import type { OAuthTokens, TokenStore } from '../oauth.js';

const PROVIDER_ID = 'google-drive' as const;
const NOW = 1_700_000_000_000;

const CONFIG = {
  providerId: PROVIDER_ID,
  clientId: 'test-client-id',
  tokenEndpoint: 'https://oauth.example.test/token',
  redirectUri: 'https://app.example.test/callback',
};

const NETWORK_ERROR = new TypeError('fetch failed');

const SERVER_FAILURE_STATUSES = [500, 429, 404] as const;
const AUTH_REJECTION_STATUSES = [400, 401, 403] as const;

function tokens(overrides: Partial<OAuthTokens> = {}): OAuthTokens {
  return {
    accessToken: 'stored-access',
    refreshToken: 'stored-refresh',
    expiresAt: NOW + 3_600_000,
    tokenType: 'Bearer',
    ...overrides,
  };
}

function nearExpiryTokens(): OAuthTokens {
  return tokens({ expiresAt: NOW + 30_000 });
}

/**
 * In-memory TokenStore double. Validates inputs like the real adapters do
 * (required providerId, required accessToken) and can back its surface with
 * either synchronous or promise-based methods, mirroring the web
 * (sync-capable localStorage) and react-native (async secure store) runtimes.
 */
class FakeTokenStore implements TokenStore {
  private readonly entries = new Map<string, OAuthTokens>();

  constructor(private readonly asyncBacked: boolean) {}

  get(providerId: string): OAuthTokens | null | Promise<OAuthTokens | null> {
    this.requireProviderId(providerId);
    const read = (): OAuthTokens | null => this.entries.get(providerId) ?? null;
    return this.asyncBacked ? Promise.resolve(read()) : read();
  }

  set(providerId: string, tokens: OAuthTokens): void | Promise<void> {
    this.requireProviderId(providerId);
    if (!tokens || typeof tokens.accessToken !== 'string' || tokens.accessToken.length === 0) {
      throw new Error('accessToken is required');
    }
    const write = (): void => {
      this.entries.set(providerId, { ...tokens });
    };
    return this.asyncBacked ? Promise.resolve(write()) : write();
  }

  remove(providerId: string): void | Promise<void> {
    this.requireProviderId(providerId);
    const drop = (): void => {
      this.entries.delete(providerId);
    };
    return this.asyncBacked ? Promise.resolve(drop()) : drop();
  }

  /** Test-only synchronous view used for state-delta snapshots. */
  peek(providerId: string): OAuthTokens | null {
    return this.entries.get(providerId) ?? null;
  }

  private requireProviderId(providerId: string): void {
    if (typeof providerId !== 'string' || providerId.length === 0) {
      throw new Error('providerId is required');
    }
  }
}

interface Harness {
  manager: InstanceType<typeof oauth.TokenManager>;
  store: FakeTokenStore;
  fetchFn: ReturnType<typeof vi.fn>;
  advance(ms: number): void;
}

function makeManager(options: { asyncBacked?: boolean } = {}): Harness {
  const store = new FakeTokenStore(options.asyncBacked ?? true);
  const clockState = { current: NOW };
  const clock = (): number => clockState.current;
  const fetchFn = vi.fn();
  const manager = new oauth.TokenManager({
    config: CONFIG,
    tokenStore: store,
    fetchFn: fetchFn as unknown as typeof fetch,
    clock,
  });
  return {
    manager,
    store,
    fetchFn,
    advance(ms: number): void {
      clockState.current += ms;
    },
  };
}

interface TokenStateSnapshot {
  access: string | undefined;
  refresh: string | undefined;
  expiry: number | undefined;
}

/** Universe under observation: the persisted token state {access, refresh, expiry}. */
function snapshot(store: FakeTokenStore): TokenStateSnapshot {
  const stored = store.peek(PROVIDER_ID);
  return {
    access: stored?.accessToken,
    refresh: stored?.refreshToken,
    expiry: stored?.expiresAt,
  };
}

async function captureRejection(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the operation to reject, but it resolved');
}

function tokenEndpointSuccess(body: Record<string, unknown> = {}): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 1800,
      token_type: 'Bearer',
      ...body,
    }),
  } as unknown as Response;
}

function tokenEndpointFailure(status: number, body = '{"error":"server_error"}'): Response {
  return { ok: false, status, text: async () => body } as unknown as Response;
}

describe('TokenManager (03-03 shared token lifecycle)', () => {
  describe('module surface', () => {
    it('exports the TokenManager class', () => {
      expect(oauth.TokenManager).toBeTypeOf('function');
    });

    it('exports the TokenStore port and the moved token-endpoint classifier', () => {
      expect(oauth.requireTokenEndpointSuccess).toBeTypeOf('function');
    });
  });

  describe.each([
    { flavor: 'async-backed store (react-native secure store shape)', asyncBacked: true },
    { flavor: 'sync-backed store (web localStorage shape)', asyncBacked: false },
  ])('$flavor', ({ asyncBacked }) => {
    describe('getAccessToken() expiry matrix', () => {
      it('absent tokens: rejects AuthRequiredError and leaves the store untouched', async () => {
        const { manager, store } = makeManager({ asyncBacked });
        const before = snapshot(store);

        await expect(manager.getAccessToken()).rejects.toThrow(AuthRequiredError);

        expect(snapshot(store)).toEqual(before);
      });

      it('fresh token: returns the stored access token without endpoint traffic', async () => {
        const { manager, store, fetchFn } = makeManager({ asyncBacked });
        await store.set(PROVIDER_ID, tokens());
        const before = snapshot(store);

        await expect(manager.getAccessToken()).resolves.toBe('stored-access');

        expect(fetchFn).not.toHaveBeenCalled();
        expect(snapshot(store)).toEqual(before);
      });

      it('near-expiry token: refreshes via the token endpoint and persists rotated tokens', async () => {
        const { manager, store, fetchFn } = makeManager({ asyncBacked });
        await store.set(PROVIDER_ID, nearExpiryTokens());
        fetchFn.mockResolvedValueOnce(tokenEndpointSuccess());

        await expect(manager.getAccessToken()).resolves.toBe('new-access');

        expect(fetchFn).toHaveBeenCalledTimes(1);
        const [url, init] = fetchFn.mock.calls[0];
        expect(url).toBe(CONFIG.tokenEndpoint);
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
        const body = new URLSearchParams(init.body);
        expect(body.get('grant_type')).toBe('refresh_token');
        expect(body.get('refresh_token')).toBe('stored-refresh');
        expect(body.get('client_id')).toBe('test-client-id');

        expect(snapshot(store)).toEqual({
          access: 'new-access',
          refresh: 'new-refresh',
          expiry: NOW + 1_800_000,
        });
      });

      it('expiry boundary: exactly at the 60s buffer is still fresh, 1ms inside triggers refresh', async () => {
        const atBoundary = makeManager({ asyncBacked });
        await atBoundary.store.set(PROVIDER_ID, tokens({ expiresAt: NOW + 60_000 }));
        await expect(atBoundary.manager.getAccessToken()).resolves.toBe('stored-access');
        expect(atBoundary.fetchFn).not.toHaveBeenCalled();

        const insideBoundary = makeManager({ asyncBacked });
        await insideBoundary.store.set(PROVIDER_ID, tokens({ expiresAt: NOW + 59_999 }));
        insideBoundary.fetchFn.mockResolvedValueOnce(tokenEndpointSuccess());
        await expect(insideBoundary.manager.getAccessToken()).resolves.toBe('new-access');
        expect(insideBoundary.fetchFn).toHaveBeenCalledTimes(1);
      });

      it('token without expiresAt: returned as-is, endpoint untouched', async () => {
        const { manager, store, fetchFn } = makeManager({ asyncBacked });
        await store.set(PROVIDER_ID, tokens({ expiresAt: undefined }));
        const before = snapshot(store);

        await expect(manager.getAccessToken()).resolves.toBe('stored-access');

        expect(fetchFn).not.toHaveBeenCalled();
        expect(snapshot(store)).toEqual(before);
      });
    });

    describe('refresh failure classes', () => {
      it('no refresh token: clears the store and rejects AuthRequiredError', async () => {
        const { manager, store } = makeManager({ asyncBacked });
        await store.set(PROVIDER_ID, tokens({ refreshToken: undefined, expiresAt: NOW + 1_000 }));

        await expect(manager.getAccessToken()).rejects.toThrow(AuthRequiredError);

        expect(snapshot(store)).toEqual({
          access: undefined,
          refresh: undefined,
          expiry: undefined,
        });
      });

      it('network failure: AuthExchangeError chaining the cause, grant preserved', async () => {
        const { manager, store, fetchFn } = makeManager({ asyncBacked });
        await store.set(PROVIDER_ID, nearExpiryTokens());
        fetchFn.mockRejectedValueOnce(NETWORK_ERROR);

        const error = await captureRejection(manager.getAccessToken());

        expect(error).toBeInstanceOf(AuthExchangeError);
        expect((error as { cause?: unknown }).cause).toBe(NETWORK_ERROR);
        expect(snapshot(store)).toEqual({
          access: 'stored-access',
          refresh: 'stored-refresh',
          expiry: NOW + 30_000,
        });
      });

      it.each(SERVER_FAILURE_STATUSES)(
        'HTTP %i: AuthExchangeError, grant preserved',
        async (status) => {
          const { manager, store, fetchFn } = makeManager({ asyncBacked });
          await store.set(PROVIDER_ID, nearExpiryTokens());
          fetchFn.mockResolvedValueOnce(tokenEndpointFailure(status));

          const error = await captureRejection(manager.getAccessToken());

          expect(error).toBeInstanceOf(AuthExchangeError);
          expect(snapshot(store)).toEqual({
            access: 'stored-access',
            refresh: 'stored-refresh',
            expiry: NOW + 30_000,
          });
        },
      );

      it('HTTP 500 cause message carries the status and body excerpt', async () => {
        const { manager, store, fetchFn } = makeManager({ asyncBacked });
        await store.set(PROVIDER_ID, nearExpiryTokens());
        fetchFn.mockResolvedValueOnce(
          tokenEndpointFailure(500, '{"error":"temporarily_unavailable","detail":"upstream down"}'),
        );

        const error = await captureRejection(manager.getAccessToken());

        expect(error).toBeInstanceOf(AuthExchangeError);
        const causeMessage = String((error as { cause?: { message?: string } }).cause?.message);
        expect(causeMessage).toContain('500');
        expect(causeMessage).toContain('upstream down');
        expect(snapshot(store)).toEqual({
          access: 'stored-access',
          refresh: 'stored-refresh',
          expiry: NOW + 30_000,
        });
      });

      it.each(AUTH_REJECTION_STATUSES)(
        'HTTP %i: AuthRequiredError and the stored grant is cleared',
        async (status) => {
          const { manager, store, fetchFn } = makeManager({ asyncBacked });
          await store.set(PROVIDER_ID, nearExpiryTokens());
          fetchFn.mockResolvedValueOnce(tokenEndpointFailure(status));

          const error = await captureRejection(manager.getAccessToken());

          expect(error).toBeInstanceOf(AuthRequiredError);
          expect(snapshot(store)).toEqual({
            access: undefined,
            refresh: undefined,
            expiry: undefined,
          });
        },
      );
    });

    describe('single-flight refresh (03-04)', () => {
      // bypass: fast-check not installed; deterministic concurrency matrix
      // N ∈ {2,5,20} over the token-state universe {access, refresh, expiry}.
      // Contract: exactly one refresh call reaches the endpoint, every caller
      // resolves with the same rotated token set, and the store is never
      // cleared when the rotation succeeds (no spurious logout).
      const CONCURRENCY_LEVELS = [2, 5, 20] as const;

      it.each(CONCURRENCY_LEVELS)(
        'N=%i concurrent getAccessToken() near expiry share one refresh; all resolve with the same rotated tokens',
        async (n) => {
          const { manager, store, fetchFn } = makeManager({ asyncBacked });
          await store.set(PROVIDER_ID, nearExpiryTokens());
          fetchFn.mockResolvedValue(tokenEndpointSuccess());

          const results = await Promise.all(
            Array.from({ length: n }, () => manager.getAccessToken()),
          );

          expect(fetchFn).toHaveBeenCalledTimes(1);
          expect(new Set(results)).toEqual(new Set(['new-access']));
          expect(snapshot(store)).toEqual({
            access: 'new-access',
            refresh: 'new-refresh',
            expiry: NOW + 1_800_000,
          });
        },
      );

      it.each(CONCURRENCY_LEVELS)(
        'N=%i concurrent refreshes rejected with 400 invalid_grant: all reject AuthRequiredError, store cleared exactly once',
        async (n) => {
          const { manager, store, fetchFn } = makeManager({ asyncBacked });
          await store.set(PROVIDER_ID, nearExpiryTokens());
          const removeSpy = vi.spyOn(store, 'remove');
          fetchFn.mockResolvedValue(tokenEndpointFailure(400));

          const outcomes = await Promise.allSettled(
            Array.from({ length: n }, () => manager.getAccessToken()),
          );

          for (const outcome of outcomes) {
            expect(outcome.status).toBe('rejected');
            expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(AuthRequiredError);
          }
          expect(fetchFn).toHaveBeenCalledTimes(1);
          expect(removeSpy).toHaveBeenCalledTimes(1);
          expect(snapshot(store)).toEqual({
            access: undefined,
            refresh: undefined,
            expiry: undefined,
          });
        },
      );

      it.each(CONCURRENCY_LEVELS)(
        'N=%i concurrent refreshes failing with HTTP 500: all reject AuthExchangeError, grant preserved (no spurious logout)',
        async (n) => {
          const { manager, store, fetchFn } = makeManager({ asyncBacked });
          await store.set(PROVIDER_ID, nearExpiryTokens());
          fetchFn.mockResolvedValue(tokenEndpointFailure(500));

          const outcomes = await Promise.allSettled(
            Array.from({ length: n }, () => manager.getAccessToken()),
          );

          for (const outcome of outcomes) {
            expect(outcome.status).toBe('rejected');
            expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(AuthExchangeError);
          }
          expect(fetchFn).toHaveBeenCalledTimes(1);
          expect(snapshot(store)).toEqual({
            access: 'stored-access',
            refresh: 'stored-refresh',
            expiry: NOW + 30_000,
          });
        },
      );

      it('a sequential read after rotation sees the persisted fresh tokens without a second refresh', async () => {
        const { manager, store, fetchFn } = makeManager({ asyncBacked });
        await store.set(PROVIDER_ID, nearExpiryTokens());
        fetchFn.mockResolvedValue(tokenEndpointSuccess());

        await expect(manager.getAccessToken()).resolves.toBe('new-access');
        await expect(manager.getAccessToken()).resolves.toBe('new-access');

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(snapshot(store)).toEqual({
          access: 'new-access',
          refresh: 'new-refresh',
          expiry: NOW + 1_800_000,
        });
      });
    });

    describe('refresh rotation semantics', () => {
      it('keeps the previous refresh token when the response omits refresh_token', async () => {
        const { manager, store, fetchFn } = makeManager({ asyncBacked });
        await store.set(PROVIDER_ID, nearExpiryTokens());
        fetchFn.mockResolvedValueOnce(tokenEndpointSuccess({ refresh_token: undefined }));

        await expect(manager.getAccessToken()).resolves.toBe('new-access');

        expect(snapshot(store)).toEqual({
          access: 'new-access',
          refresh: 'stored-refresh',
          expiry: NOW + 1_800_000,
        });
      });

      it('defaults the persisted token type to Bearer when the response omits it', async () => {
        const { manager, store, fetchFn } = makeManager({ asyncBacked });
        await store.set(PROVIDER_ID, nearExpiryTokens());
        fetchFn.mockResolvedValueOnce(tokenEndpointSuccess({ token_type: undefined }));

        await expect(manager.getAccessToken()).resolves.toBe('new-access');

        expect(store.peek(PROVIDER_ID)?.tokenType).toBe('Bearer');
      });
    });

    describe('exchangeAuthorizationCode()', () => {
      it('posts the authorization_code grant and persists the exchanged tokens', async () => {
        const { manager, store, fetchFn } = makeManager({ asyncBacked });
        fetchFn.mockResolvedValueOnce(
          tokenEndpointSuccess({
            access_token: 'code-access',
            refresh_token: 'code-refresh',
            expires_in: 600,
          }),
        );

        const exchanged = await manager.exchangeAuthorizationCode('auth-code', 'verifier-123');

        expect(exchanged).toMatchObject({
          accessToken: 'code-access',
          refreshToken: 'code-refresh',
        });
        expect(fetchFn).toHaveBeenCalledTimes(1);
        const [url, init] = fetchFn.mock.calls[0];
        expect(url).toBe(CONFIG.tokenEndpoint);
        expect(init.method).toBe('POST');
        const body = new URLSearchParams(init.body);
        expect(body.get('grant_type')).toBe('authorization_code');
        expect(body.get('code')).toBe('auth-code');
        expect(body.get('code_verifier')).toBe('verifier-123');
        expect(body.get('redirect_uri')).toBe(CONFIG.redirectUri);
        expect(body.get('client_id')).toBe(CONFIG.clientId);
        expect(snapshot(store)).toEqual({
          access: 'code-access',
          refresh: 'code-refresh',
          expiry: NOW + 600_000,
        });
      });

      it('omits code_verifier when none is provided (optional PKCE)', async () => {
        const { manager, fetchFn } = makeManager({ asyncBacked });
        fetchFn.mockResolvedValueOnce(tokenEndpointSuccess());

        await manager.exchangeAuthorizationCode('auth-code');

        const body = new URLSearchParams(fetchFn.mock.calls[0][1].body);
        expect(body.get('code_verifier')).toBeNull();
      });

      it('failure classes leave any previously stored grant untouched', async () => {
        const { manager, store, fetchFn } = makeManager({ asyncBacked });
        await store.set(
          PROVIDER_ID,
          tokens({
            accessToken: 'prior-access',
            refreshToken: 'prior-refresh',
            expiresAt: NOW + 5_000,
          }),
        );
        const priorState: TokenStateSnapshot = {
          access: 'prior-access',
          refresh: 'prior-refresh',
          expiry: NOW + 5_000,
        };

        fetchFn.mockRejectedValueOnce(NETWORK_ERROR);
        const networkError = await captureRejection(manager.exchangeAuthorizationCode('code'));
        expect(networkError).toBeInstanceOf(AuthExchangeError);

        fetchFn.mockResolvedValueOnce(tokenEndpointFailure(500));
        const serverError = await captureRejection(manager.exchangeAuthorizationCode('code'));
        expect(serverError).toBeInstanceOf(AuthExchangeError);

        fetchFn.mockResolvedValueOnce(tokenEndpointFailure(400));
        const rejection = await captureRejection(manager.exchangeAuthorizationCode('code'));
        expect(rejection).toBeInstanceOf(AuthRequiredError);

        expect(snapshot(store)).toEqual(priorState);
      });
    });

    describe('getAuthHeaders() / getTokens() / logout()', () => {
      it('getAuthHeaders() returns the Bearer header for a fresh token', async () => {
        const { manager, store, fetchFn } = makeManager({ asyncBacked });
        await store.set(PROVIDER_ID, tokens());

        await expect(manager.getAuthHeaders()).resolves.toEqual({
          Authorization: 'Bearer stored-access',
        });

        expect(fetchFn).not.toHaveBeenCalled();
      });

      it('getAuthHeaders() refreshes first and returns the renewed Bearer header', async () => {
        const { manager, store, fetchFn } = makeManager({ asyncBacked });
        await store.set(PROVIDER_ID, nearExpiryTokens());
        fetchFn.mockResolvedValueOnce(tokenEndpointSuccess({ access_token: 'header-access' }));

        await expect(manager.getAuthHeaders()).resolves.toEqual({
          Authorization: 'Bearer header-access',
        });

        expect(snapshot(store)).toEqual({
          access: 'header-access',
          refresh: 'new-refresh',
          expiry: NOW + 1_800_000,
        });
      });

      it('getTokens() returns the stored grant or null', async () => {
        const { manager, store } = makeManager({ asyncBacked });
        await expect(manager.getTokens()).resolves.toBeNull();

        await store.set(PROVIDER_ID, tokens());
        await expect(manager.getTokens()).resolves.toMatchObject({ accessToken: 'stored-access' });
      });

      it('logout() clears the grant; the next getAccessToken() demands re-auth', async () => {
        const { manager, store } = makeManager({ asyncBacked });
        await store.set(PROVIDER_ID, tokens());

        await manager.logout();

        expect(snapshot(store)).toEqual({
          access: undefined,
          refresh: undefined,
          expiry: undefined,
        });
        await expect(manager.getAccessToken()).rejects.toThrow(AuthRequiredError);
      });
    });
  });

  describe('injected clock', () => {
    it('computes the refreshed expiry from the injected clock, not Date.now', async () => {
      const { manager, store, fetchFn, advance } = makeManager({ asyncBacked: true });
      await store.set(PROVIDER_ID, nearExpiryTokens());
      fetchFn.mockResolvedValueOnce(tokenEndpointSuccess({ expires_in: 120 }));
      advance(5_000);

      await expect(manager.getAccessToken()).resolves.toBe('new-access');

      expect(snapshot(store)).toEqual({
        access: 'new-access',
        refresh: 'new-refresh',
        expiry: NOW + 5_000 + 120_000,
      });
    });
  });

  describe('pending-state validation (03-04)', () => {
    it('exports the 10-minute TTL constant and the pure validator', () => {
      expect(oauth.PENDING_STATE_TTL_MS).toBe(600_000);
      expect(oauth.isPendingStateUsable).toBeTypeOf('function');
    });

    // bypass: fast-check not installed; deterministic age/provider matrix
    // with explicit boundary ages (0, inside, TTL, TTL+1, negative) over the
    // pure validator — the single implementation consumed by both runtimes'
    // completeAuthFlow paths.
    function pending(createdAt: number, providerId: string = PROVIDER_ID): oauth.PendingAuthState {
      return {
        providerId: providerId as oauth.PendingAuthState['providerId'],
        codeVerifier: 'verifier',
        state: 'state-1',
        createdAt,
      };
    }

    it('accepts a matching provider with an age within the TTL window', () => {
      expect(oauth.isPendingStateUsable(pending(NOW), PROVIDER_ID, NOW)).toBe(true);
      expect(oauth.isPendingStateUsable(pending(NOW - 599_999), PROVIDER_ID, NOW)).toBe(true);
    });

    it('rejects a providerId mismatch regardless of age', () => {
      expect(oauth.isPendingStateUsable(pending(NOW, 'dropbox'), PROVIDER_ID, NOW)).toBe(false);
    });

    it('rejects ages past the TTL boundary, future-dated createdAt, and non-finite createdAt', () => {
      expect(oauth.isPendingStateUsable(pending(NOW - 600_001), PROVIDER_ID, NOW)).toBe(false);
      expect(oauth.isPendingStateUsable(pending(NOW + 1), PROVIDER_ID, NOW)).toBe(false);
      expect(oauth.isPendingStateUsable(pending(Number.NaN), PROVIDER_ID, NOW)).toBe(false);
    });
  });

  describe('requireTokenEndpointSuccess (response classifier moved from auth-web)', () => {
    it('resolves on a 200 response', async () => {
      await expect(
        oauth.requireTokenEndpointSuccess(tokenEndpointSuccess(), PROVIDER_ID),
      ).resolves.toBeUndefined();
    });

    it.each(AUTH_REJECTION_STATUSES)('HTTP %i throws AuthRequiredError', async (status) => {
      const error = await captureRejection(
        oauth.requireTokenEndpointSuccess(tokenEndpointFailure(status), PROVIDER_ID),
      );
      expect(error).toBeInstanceOf(AuthRequiredError);
    });

    it.each(SERVER_FAILURE_STATUSES)(
      'HTTP %i throws AuthExchangeError with status and excerpt',
      async (status) => {
        const error = await captureRejection(
          oauth.requireTokenEndpointSuccess(
            tokenEndpointFailure(status, '{"error":"upstream"}'),
            PROVIDER_ID,
          ),
        );
        expect(error).toBeInstanceOf(AuthExchangeError);
        const causeMessage = String((error as { cause?: { message?: string } }).cause?.message);
        expect(causeMessage).toContain(String(status));
        expect(causeMessage).toContain('upstream');
      },
    );

    it('appends a placeholder when the failure body cannot be read', async () => {
      const response = {
        ok: false,
        status: 502,
        text: async () => {
          throw new Error('body stream consumed');
        },
      } as unknown as Response;

      const error = await captureRejection(
        oauth.requireTokenEndpointSuccess(response, PROVIDER_ID),
      );

      expect(error).toBeInstanceOf(AuthExchangeError);
      const causeMessage = String((error as { cause?: { message?: string } }).cause?.message);
      expect(causeMessage).toContain('502');
      expect(causeMessage).toContain('<unreadable body>');
    });
  });
});
