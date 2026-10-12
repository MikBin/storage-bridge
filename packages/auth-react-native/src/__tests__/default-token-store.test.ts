import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactNativeOAuthClient } from '../oauth-client.js';
import type { ReactNativeOAuthConfig } from '../types.js';
import type { OAuthTokens } from '@storage-bridge/auth-web';

const secureStoreMocks = {
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
};

vi.mock('expo-secure-store', () => secureStoreMocks);

const mockPromptAsync = vi.fn();

vi.mock('expo-auth-session', () => {
  return {
    AuthRequest: class {
      codeVerifier = 'mock-verifier';
      promptAsync = mockPromptAsync;
    }
  };
});

const mockConfig: ReactNativeOAuthConfig = {
  providerId: 'google-drive',
  clientId: 'native-client-id',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  redirectUri: 'myapp://oauth/callback',
};

const storedTokens: OAuthTokens = {
  accessToken: 'secure-default-access',
  refreshToken: 'secure-default-refresh',
  expiresAt: Date.now() + 3_600_000,
  tokenType: 'Bearer',
};

function successAuthPrompt(): void {
  mockPromptAsync.mockResolvedValueOnce({
    type: 'success',
    params: { code: 'native-auth-code', state: 'some-state' },
  });
}

function successTokenResponse(mockFetch: ReturnType<typeof vi.fn>, accessToken: string): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      access_token: accessToken,
      refresh_token: 'token-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
  });
}

describe('default token store resolution (02-07)', () => {
  // bypass: fast-check not installed; deterministic case matrix —
  // expo-secure-store present -> secure default used with zero configuration;
  // explicit store wins; non-viable module -> actionable rejection.
  // The module-absent case is exercised in default-token-store.absent.test.ts.

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists login tokens through the secure store with zero consumer configuration', async () => {
    secureStoreMocks.setItemAsync.mockResolvedValue(undefined);
    secureStoreMocks.getItemAsync.mockResolvedValue(JSON.stringify(storedTokens));
    successAuthPrompt();
    const mockFetch = vi.fn();
    successTokenResponse(mockFetch, 'secure-default-access');

    const client = await ReactNativeOAuthClient.create({
      config: mockConfig,
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    await client.login();

    expect(secureStoreMocks.setItemAsync).toHaveBeenCalledWith(
      'sb_auth_google-drive',
      expect.stringContaining('secure-default-access'),
    );
    await expect(client.getTokens()).resolves.toEqual(storedTokens);
    expect(secureStoreMocks.getItemAsync).toHaveBeenCalledWith('sb_auth_google-drive');
  });

  it('uses an explicitly provided tokenStore and never touches the secure store', async () => {
    const explicitStore = {
      get: vi.fn<() => Promise<OAuthTokens | null>>().mockResolvedValue(null),
      set: vi.fn<(id: string, tokens: OAuthTokens) => Promise<void>>().mockResolvedValue(undefined),
      remove: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    };
    successAuthPrompt();
    const mockFetch = vi.fn();
    successTokenResponse(mockFetch, 'explicit-access');

    const client = await ReactNativeOAuthClient.create({
      config: mockConfig,
      tokenStore: explicitStore,
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    await client.login();

    expect(explicitStore.set).toHaveBeenCalledWith(
      'google-drive',
      expect.objectContaining({ accessToken: 'explicit-access' }),
    );
    expect(secureStoreMocks.setItemAsync).not.toHaveBeenCalled();
    expect(secureStoreMocks.getItemAsync).not.toHaveBeenCalled();
  });

  it('rejects direct construction without a tokenStore, pointing at create() or an explicit store', () => {
    expect(() => new ReactNativeOAuthClient({ config: mockConfig })).toThrow(/tokenStore/);
    expect(() => new ReactNativeOAuthClient({ config: mockConfig })).toThrow(/ReactNativeOAuthClient\.create/);
  });

  it('rejects when the resolved module is not a viable secure store', async () => {
    // Registered last: doMock overrides the hoisted factory for subsequent
    // imports only, so this test re-imports the module under a broken module
    // shape (functions missing) to prove viability is checked, not assumed.
    vi.resetModules();
    vi.doMock('expo-secure-store', () => ({
      getItemAsync: vi.fn(),
    }));
    const clientModule = await import('../oauth-client.js');

    await expect(clientModule.createDefaultTokenStore()).rejects.toThrow(/expo-secure-store/);
    await expect(clientModule.createDefaultTokenStore()).rejects.toThrow(/tokenStore/);
  });
});
