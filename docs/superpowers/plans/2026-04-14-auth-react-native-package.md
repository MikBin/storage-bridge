# Auth React Native Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `packages/auth-react-native` with native/hybrid OAuth auth for React Native apps — using native secure storage and deep linking instead of browser APIs, satisfying the same `OAuthClient` interface as `auth-web`.

**Architecture:** Three source modules in `packages/auth-react-native`. `secure-token-store.ts` wraps `expo-secure-store` for secure token storage via iOS Keychain / Android Keystore. `deep-link-handler.ts` provides utilities for parsing OAuth deep link callbacks and building redirect URIs. `oauth-client.ts` implements `ReactNativeOAuthClient` using `expo-auth-session` for the native auth flow. Tests mock all native modules — no real device needed.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo, `@storage-bridge/core`, `@storage-bridge/auth-web` (shared types), `expo-auth-session` / `expo-secure-store` (peer dependencies)

**Spec:** `docs/superpowers/specs/2026-04-14-auth-react-native-package-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/auth-react-native/package.json` | Create | Package manifest with peer deps on expo modules |
| `packages/auth-react-native/tsconfig.json` | Create | TypeScript config extending shared base |
| `packages/auth-react-native/vitest.config.ts` | Create | Vitest config |
| `packages/auth-react-native/src/types.ts` | Create | `ReactNativeOAuthConfig` type |
| `packages/auth-react-native/src/secure-token-store.ts` | Create | `SecureTokenStore` wrapping expo-secure-store |
| `packages/auth-react-native/src/deep-link-handler.ts` | Create | `parseCallbackUrl()`, `buildRedirectUri()` |
| `packages/auth-react-native/src/oauth-client.ts` | Create | `ReactNativeOAuthClient` implementing `OAuthClient` |
| `packages/auth-react-native/src/index.ts` | Create | Barrel re-export |
| `packages/auth-react-native/src/__tests__/secure-token-store.test.ts` | Create | Secure token store tests |
| `packages/auth-react-native/src/__tests__/deep-link-handler.test.ts` | Create | Deep link handler tests |
| `packages/auth-react-native/src/__tests__/oauth-client.test.ts` | Create | OAuth client tests |

---

### Task 1: Package Scaffold and Types

**Files:**
- Create: `packages/auth-react-native/package.json`
- Create: `packages/auth-react-native/tsconfig.json`
- Create: `packages/auth-react-native/vitest.config.ts`
- Create: `packages/auth-react-native/src/types.ts`

- [ ] **Step 1: Create `packages/auth-react-native/package.json`**

```json
{
  "name": "@storage-bridge/auth-react-native",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@storage-bridge/core": "workspace:*",
    "@storage-bridge/auth-web": "workspace:*"
  },
  "peerDependencies": {
    "expo-auth-session": ">=5.0.0",
    "expo-secure-store": ">=12.0.0"
  },
  "peerDependenciesMeta": {
    "expo-auth-session": { "optional": false },
    "expo-secure-store": { "optional": false }
  },
  "devDependencies": {
    "@storage-bridge/eslint-config": "workspace:*",
    "@storage-bridge/typescript-config": "workspace:*",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Create `packages/auth-react-native/tsconfig.json`**

```json
{
  "extends": "@storage-bridge/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/auth-react-native/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create `packages/auth-react-native/src/types.ts`**

```ts
import type { ProviderId } from '@storage-bridge/core';

/**
 * Configuration for React Native OAuth client.
 * Mirrors OAuthProviderConfig from auth-web but adapted for native flows.
 */
export interface ReactNativeOAuthConfig {
  providerId: ProviderId;
  clientId: string;
  /** Authorization endpoint URL */
  authorizationEndpoint: string;
  /** Token endpoint URL */
  tokenEndpoint: string;
  /** OAuth scopes to request */
  scopes: string[];
  /** Registered deep link redirect URI (e.g., 'myapp://oauth/callback') */
  redirectUri: string;
  /** Optional additional auth params */
  extraAuthParams?: Record<string, string>;
}
```

- [ ] **Step 5: Install dependencies**

Run: `cd packages/auth-react-native && pnpm install`
Expected: Dependencies linked successfully

- [ ] **Step 6: Commit**

```bash
git add packages/auth-react-native/package.json packages/auth-react-native/tsconfig.json packages/auth-react-native/vitest.config.ts packages/auth-react-native/src/types.ts
git commit -m "chore(auth-react-native): scaffold @storage-bridge/auth-react-native package with types"
```

---

### Task 2: Secure Token Store — Failing Tests

**Files:**
- Create: `packages/auth-react-native/src/__tests__/secure-token-store.test.ts`

- [ ] **Step 7: Write the failing secure token store tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecureTokenStore } from '../secure-token-store.js';
import type { OAuthTokens } from '@storage-bridge/auth-web';

// Mock expo-secure-store
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
```

- [ ] **Step 8: Run tests to verify they fail**

Run: `cd packages/auth-react-native && npx vitest run src/__tests__/secure-token-store.test.ts`
Expected: FAIL — module `../secure-token-store.js` not found

---

### Task 3: Secure Token Store — Implementation

**Files:**
- Create: `packages/auth-react-native/src/secure-token-store.ts`

- [ ] **Step 9: Write the SecureTokenStore implementation**

```ts
import type { OAuthTokens } from '@storage-bridge/auth-web';
import * as SecureStore from 'expo-secure-store';

/**
 * Secure token storage using expo-secure-store.
 * Delegates to iOS Keychain / Android Keystore under the hood.
 */
export class SecureTokenStore {
  constructor(private readonly prefix: string = 'sb_auth_') {}

  async get(providerId: string): Promise<OAuthTokens | null> {
    const raw = await SecureStore.getItemAsync(this.keyFor(providerId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OAuthTokens;
    } catch {
      return null;
    }
  }

  async set(providerId: string, tokens: OAuthTokens): Promise<void> {
    await SecureStore.setItemAsync(this.keyFor(providerId), JSON.stringify(tokens));
  }

  async remove(providerId: string): Promise<void> {
    await SecureStore.deleteItemAsync(this.keyFor(providerId));
  }

  private keyFor(providerId: string): string {
    return `${this.prefix}${providerId}`;
  }
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd packages/auth-react-native && npx vitest run src/__tests__/secure-token-store.test.ts`
Expected: ALL PASS

- [ ] **Step 11: Commit**

```bash
git add packages/auth-react-native/src/secure-token-store.ts packages/auth-react-native/src/__tests__/secure-token-store.test.ts
git commit -m "feat(auth-react-native): add SecureTokenStore wrapping expo-secure-store with tests"
```

---

### Task 4: Deep Link Handler — Failing Tests

**Files:**
- Create: `packages/auth-react-native/src/__tests__/deep-link-handler.test.ts`

- [ ] **Step 12: Write the failing deep link handler tests**

```ts
import { describe, it, expect } from 'vitest';
import { parseCallbackUrl, buildRedirectUri } from '../deep-link-handler.js';

describe('parseCallbackUrl', () => {
  it('extracts code and state from valid deep link', () => {
    const url = 'myapp://oauth/callback?code=auth-code-123&state=random-state';
    const result = parseCallbackUrl(url);
    expect(result).not.toBeNull();
    expect(result!.code).toBe('auth-code-123');
    expect(result!.state).toBe('random-state');
  });

  it('returns null for URL without auth params', () => {
    const url = 'myapp://oauth/callback';
    const result = parseCallbackUrl(url);
    expect(result).toBeNull();
  });

  it('returns null for URL with only code (missing state)', () => {
    const url = 'myapp://oauth/callback?code=auth-code';
    const result = parseCallbackUrl(url);
    expect(result).toBeNull();
  });

  it('returns null for URL with only state (missing code)', () => {
    const url = 'myapp://oauth/callback?state=some-state';
    const result = parseCallbackUrl(url);
    expect(result).toBeNull();
  });

  it('returns null for malformed URL', () => {
    expect(parseCallbackUrl('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCallbackUrl('')).toBeNull();
  });
});

describe('buildRedirectUri', () => {
  it('constructs correct URI with default path', () => {
    const uri = buildRedirectUri('myapp');
    expect(uri).toBe('myapp://oauth/callback');
  });

  it('constructs URI with custom path', () => {
    const uri = buildRedirectUri('myapp', 'auth/return');
    expect(uri).toBe('myapp://auth/return');
  });

  it('handles scheme with trailing colon', () => {
    const uri = buildRedirectUri('myapp:');
    expect(uri).toBe('myapp://oauth/callback');
  });
});
```

- [ ] **Step 13: Run tests to verify they fail**

Run: `cd packages/auth-react-native && npx vitest run src/__tests__/deep-link-handler.test.ts`
Expected: FAIL — module `../deep-link-handler.js` not found

---

### Task 5: Deep Link Handler — Implementation

**Files:**
- Create: `packages/auth-react-native/src/deep-link-handler.ts`

- [ ] **Step 14: Write the deep link handler implementation**

```ts
/**
 * Parse an OAuth callback deep link URL.
 * Extracts authorization code and state from the URL query params.
 *
 * @param url The deep link URL (e.g., 'myapp://oauth/callback?code=xxx&state=yyy')
 * @returns Parsed result or null if not a valid callback URL
 */
export function parseCallbackUrl(url: string): { code: string; state: string } | null {
  if (!url) return null;

  try {
    // Handle deep link URLs that may not parse with standard URL constructor
    // by replacing the scheme with http for parsing, then extracting params
    const parseable = url.includes('://') ? `http${url.substring(url.indexOf('://'))}` : url;
    const parsed = new URL(parseable);
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');

    if (!code || !state) return null;

    return { code, state };
  } catch {
    return null;
  }
}

/**
 * Build the redirect URI for a given scheme and path.
 * Utility for apps that need to construct their deep link URI.
 *
 * @param scheme The app URL scheme (e.g., 'myapp')
 * @param path The path after the scheme (default: 'oauth/callback')
 */
export function buildRedirectUri(scheme: string, path: string = 'oauth/callback'): string {
  const cleanScheme = scheme.replace(/:$/, '');
  return `${cleanScheme}://${path}`;
}
```

- [ ] **Step 15: Run tests to verify they pass**

Run: `cd packages/auth-react-native && npx vitest run src/__tests__/deep-link-handler.test.ts`
Expected: ALL PASS

- [ ] **Step 16: Commit**

```bash
git add packages/auth-react-native/src/deep-link-handler.ts packages/auth-react-native/src/__tests__/deep-link-handler.test.ts
git commit -m "feat(auth-react-native): add deep link handler with URL parsing and building utilities"
```

---

### Task 6: ReactNativeOAuthClient — Failing Tests

**Files:**
- Create: `packages/auth-react-native/src/__tests__/oauth-client.test.ts`

- [ ] **Step 17: Write the failing OAuth client tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactNativeOAuthClient } from '../oauth-client.js';
import type { ReactNativeOAuthConfig } from '../types.js';
import { AuthRequiredError } from '@storage-bridge/core';

const mockConfig: ReactNativeOAuthConfig = {
  providerId: 'google-drive',
  clientId: 'native-client-id',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  redirectUri: 'myapp://oauth/callback',
};

// Mock expo-auth-session
vi.mock('expo-auth-session', () => ({
  AuthSession: {
    startAsync: vi.fn(),
  },
}));

import { AuthSession } from 'expo-auth-session';

describe('ReactNativeOAuthClient', () => {
  let client: ReactNativeOAuthClient;
  let mockTokenStore: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTokenStore = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    mockFetch = vi.fn();
    client = new ReactNativeOAuthClient({
      config: mockConfig,
      tokenStore: mockTokenStore as any,
      fetchFn: mockFetch,
    });
  });

  describe('login()', () => {
    it('calls AuthSession.startAsync and exchanges code for tokens', async () => {
      vi.mocked(AuthSession.startAsync).mockResolvedValueOnce({
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

      expect(AuthSession.startAsync).toHaveBeenCalledWith(
        expect.objectContaining({ authUrl: expect.any(String) }),
      );

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
      vi.mocked(AuthSession.startAsync).mockResolvedValueOnce({
        type: 'cancel',
      });

      await expect(client.login()).rejects.toThrow(AuthRequiredError);
    });

    it('throws AuthRequiredError on auth error', async () => {
      vi.mocked(AuthSession.startAsync).mockResolvedValueOnce({
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
```

- [ ] **Step 18: Run tests to verify they fail**

Run: `cd packages/auth-react-native && npx vitest run src/__tests__/oauth-client.test.ts`
Expected: FAIL — module `../oauth-client.js` not found

---

### Task 7: ReactNativeOAuthClient — Implementation

**Files:**
- Create: `packages/auth-react-native/src/oauth-client.ts`

- [ ] **Step 19: Write the ReactNativeOAuthClient implementation**

```ts
import type { OAuthClient, OAuthTokens } from '@storage-bridge/auth-web';
import type { ReactNativeOAuthConfig } from './types.js';
import { AuthSession } from 'expo-auth-session';
import { AuthRequiredError } from '@storage-bridge/core';

const REFRESH_BUFFER_MS = 60_000;

/**
 * Token storage interface matching auth-web's TokenStore but with async methods.
 * SecureTokenStore implements this interface.
 */
export interface NativeTokenStore {
  get(providerId: string): Promise<OAuthTokens | null>;
  set(providerId: string, tokens: OAuthTokens): Promise<void>;
  remove(providerId: string): Promise<void>;
}

export interface ReactNativeOAuthClientOptions {
  config: ReactNativeOAuthConfig;
  tokenStore?: NativeTokenStore;
  fetchFn?: typeof fetch;
}

export class ReactNativeOAuthClient implements OAuthClient {
  private readonly config: ReactNativeOAuthConfig;
  private readonly tokenStore: NativeTokenStore;
  private readonly fetchFn: typeof fetch;

  constructor(options: ReactNativeOAuthClientOptions) {
    this.config = options.config;
    this.tokenStore = options.tokenStore ?? this.createDefaultTokenStore();
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async login(): Promise<void> {
    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
    });

    if (this.config.extraAuthParams) {
      for (const [key, value] of Object.entries(this.config.extraAuthParams)) {
        params.set(key, value);
      }
    }

    const authUrl = `${this.config.authorizationEndpoint}?${params.toString()}`;

    const result = await AuthSession.startAsync({ authUrl });

    if (result.type !== 'success') {
      throw new AuthRequiredError(this.config.providerId);
    }

    const code = result.params?.code;
    if (!code) {
      throw new AuthRequiredError(this.config.providerId);
    }

    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
    });

    const response = await this.fetchFn(this.config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!response.ok) {
      throw new AuthRequiredError(this.config.providerId);
    }

    const json = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };

    const tokens: OAuthTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
      tokenType: (json.token_type as 'Bearer') ?? 'Bearer',
    };

    await this.tokenStore.set(this.config.providerId, tokens);
  }

  async logout(): Promise<void> {
    await this.tokenStore.remove(this.config.providerId);
  }

  async getAccessToken(): Promise<string> {
    const tokens = await this.tokenStore.get(this.config.providerId);
    if (!tokens) {
      throw new AuthRequiredError(this.config.providerId);
    }

    if (tokens.expiresAt && tokens.expiresAt - Date.now() < REFRESH_BUFFER_MS) {
      return this.refreshTokens(tokens);
    }

    return tokens.accessToken;
  }

  async getTokens(): Promise<OAuthTokens | null> {
    return this.tokenStore.get(this.config.providerId);
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }

  private async refreshTokens(tokens: OAuthTokens): Promise<string> {
    if (!tokens.refreshToken) {
      await this.tokenStore.remove(this.config.providerId);
      throw new AuthRequiredError(this.config.providerId);
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: this.config.clientId,
    });

    const response = await this.fetchFn(this.config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      await this.tokenStore.remove(this.config.providerId);
      throw new AuthRequiredError(this.config.providerId);
    }

    const json = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };

    const newTokens: OAuthTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? tokens.refreshToken,
      expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
      tokenType: (json.token_type as 'Bearer') ?? 'Bearer',
    };

    await this.tokenStore.set(this.config.providerId, newTokens);
    return newTokens.accessToken;
  }

  private createDefaultTokenStore(): NativeTokenStore {
    // Lazy import to avoid requiring expo-secure-store at module load time
    // in non-React-Native environments (e.g., during build)
    throw new Error(
      'SecureTokenStore requires expo-secure-store. ' +
      'Please provide a tokenStore option or ensure expo-secure-store is installed.',
    );
  }
}
```

- [ ] **Step 20: Run tests to verify they pass**

Run: `cd packages/auth-react-native && npx vitest run src/__tests__/oauth-client.test.ts`
Expected: ALL PASS

- [ ] **Step 21: Commit**

```bash
git add packages/auth-react-native/src/oauth-client.ts packages/auth-react-native/src/__tests__/oauth-client.test.ts
git commit -m "feat(auth-react-native): add ReactNativeOAuthClient with expo-auth-session and tests"
```

---

### Task 8: Barrel Export and Final Verification

**Files:**
- Create: `packages/auth-react-native/src/index.ts`

- [ ] **Step 22: Create the barrel export**

```ts
export * from './types.js';
export * from './secure-token-store.js';
export * from './deep-link-handler.js';
export * from './oauth-client.js';
```

- [ ] **Step 23: Run full test suite**

Run: `cd packages/auth-react-native && npx vitest run`
Expected: ALL PASS

- [ ] **Step 24: Run typecheck**

Run: `cd packages/auth-react-native && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 25: Commit**

```bash
git add packages/auth-react-native/src/index.ts
git commit -m "feat(auth-react-native): add barrel export for @storage-bridge/auth-react-native"