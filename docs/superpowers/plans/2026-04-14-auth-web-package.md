# Auth Web Package (Browser OAuth PKCE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `packages/auth-web` with a browser-based OAuth 2.0 PKCE client that satisfies the `OAuthClient` interface — handling PKCE challenge generation, redirect-based login, token exchange, secure storage, and automatic refresh.

**Architecture:** Four source modules in `packages/auth-web`. `pkce.ts` generates cryptographic verifier/challenge pairs via Web Crypto API. `token-store.ts` provides a pluggable `TokenStore` interface with `localStorage` and `sessionStorage` implementations. `redirect-handler.ts` manages PKCE state persistence and OAuth callback detection. `oauth-client.ts` orchestrates the full PKCE flow via `BrowserOAuthClient`. Tests mock all browser APIs — no real browser or network calls.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo, `@storage-bridge/core`, Web Crypto API

**Spec:** `docs/superpowers/specs/2026-04-14-auth-web-package-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/auth-web/package.json` | Create | Package manifest with `@storage-bridge/core` dependency |
| `packages/auth-web/tsconfig.json` | Create | TypeScript config extending shared base |
| `packages/auth-web/vitest.config.ts` | Create | Vitest config |
| `packages/auth-web/src/types.ts` | Create | `OAuthTokens`, `OAuthClient`, `OAuthProviderConfig`, `PendingAuthState` types |
| `packages/auth-web/src/pkce.ts` | Create | `generateCodeVerifier()`, `generateCodeChallenge()` |
| `packages/auth-web/src/token-store.ts` | Create | `TokenStore` interface, `LocalStorageTokenStore`, `SessionStorageTokenStore` |
| `packages/auth-web/src/redirect-handler.ts` | Create | `handleCallback()`, `savePendingState()`, `consumePendingState()` |
| `packages/auth-web/src/oauth-client.ts` | Create | `BrowserOAuthClient` implementing `OAuthClient` |
| `packages/auth-web/src/index.ts` | Create | Barrel re-export |
| `packages/auth-web/src/__tests__/pkce.test.ts` | Create | PKCE generation tests |
| `packages/auth-web/src/__tests__/token-store.test.ts` | Create | Token store tests |
| `packages/auth-web/src/__tests__/redirect-handler.test.ts` | Create | Redirect handler tests |
| `packages/auth-web/src/__tests__/oauth-client.test.ts` | Create | OAuth client tests |

---

### Task 1: Package Scaffold and Types

**Files:**
- Create: `packages/auth-web/package.json`
- Create: `packages/auth-web/tsconfig.json`
- Create: `packages/auth-web/vitest.config.ts`
- Create: `packages/auth-web/src/types.ts`

- [ ] **Step 1: Create `packages/auth-web/package.json`**

```json
{
  "name": "@storage-bridge/auth-web",
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
    "@storage-bridge/core": "workspace:*"
  },
  "devDependencies": {
    "@storage-bridge/eslint-config": "workspace:*",
    "@storage-bridge/typescript-config": "workspace:*",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Create `packages/auth-web/tsconfig.json`**

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

- [ ] **Step 3: Create `packages/auth-web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create `packages/auth-web/src/types.ts`**

```ts
import type { ProviderId } from '@storage-bridge/core';

/**
 * OAuth token set stored after successful authentication.
 */
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Unix timestamp in milliseconds when the access token expires */
  expiresAt?: number;
  tokenType?: 'Bearer';
}

/**
 * Auth client interface satisfied by BrowserOAuthClient.
 * Provider adapters depend on this interface, not the concrete class.
 */
export interface OAuthClient {
  login(): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string>;
  getTokens(): Promise<OAuthTokens | null>;
  getAuthHeaders(): Promise<Record<string, string>>;
}

/**
 * Provider-specific OAuth configuration.
 * Each provider package (google-drive, dropbox, onedrive) provides one of these.
 */
export interface OAuthProviderConfig {
  /** Provider identifier for storage namespacing */
  providerId: ProviderId;
  /** OAuth 2.0 client ID */
  clientId: string;
  /** Authorization endpoint URL */
  authorizationEndpoint: string;
  /** Token endpoint URL */
  tokenEndpoint: string;
  /** Redirect URI (typically window.location.origin + callback path) */
  redirectUri: string;
  /** OAuth scopes to request */
  scopes: string[];
  /** Optional additional auth params (e.g., prompt, access_type) */
  extraAuthParams?: Record<string, string>;
}

/**
 * State persisted to sessionStorage during the redirect flow.
 * Used to verify the callback and complete the PKCE exchange.
 */
export interface PendingAuthState {
  providerId: ProviderId;
  codeVerifier: string;
  state: string;
  createdAt: number;
}
```

- [ ] **Step 5: Install dependencies**

Run: `cd packages/auth-web && pnpm install`
Expected: Dependencies linked successfully

- [ ] **Step 6: Commit**

```bash
git add packages/auth-web/package.json packages/auth-web/tsconfig.json packages/auth-web/vitest.config.ts packages/auth-web/src/types.ts
git commit -m "chore(auth-web): scaffold @storage-bridge/auth-web package with types"
```

---

### Task 2: PKCE — Failing Tests

**Files:**
- Create: `packages/auth-web/src/__tests__/pkce.test.ts`

- [ ] **Step 7: Write the failing PKCE tests**

```ts
import { describe, it, expect } from 'vitest';
import { generateCodeVerifier, generateCodeChallenge } from '../pkce.js';

describe('generateCodeVerifier', () => {
  it('returns a base64url-encoded string of 43 characters', async () => {
    const verifier = await generateCodeVerifier();
    expect(verifier).toHaveLength(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns different values on successive calls', async () => {
    const a = await generateCodeVerifier();
    const b = await generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe('generateCodeChallenge', () => {
  it('returns a base64url-encoded string', async () => {
    const verifier = await generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is deterministic — same verifier produces same challenge', async () => {
    const verifier = 'test-verifier-value-for-determinism-check';
    const a = await generateCodeChallenge(verifier);
    const b = await generateCodeChallenge(verifier);
    expect(a).toBe(b);
  });

  it('produces different challenges for different verifiers', async () => {
    const challengeA = await generateCodeChallenge('verifier-a');
    const challengeB = await generateCodeChallenge('verifier-b');
    expect(challengeA).not.toBe(challengeB);
  });
});
```

- [ ] **Step 8: Run tests to verify they fail**

Run: `cd packages/auth-web && npx vitest run src/__tests__/pkce.test.ts`
Expected: FAIL — module `../pkce.js` not found

---

### Task 3: PKCE — Implementation

**Files:**
- Create: `packages/auth-web/src/pkce.ts`

- [ ] **Step 9: Write the PKCE implementation**

```ts
/**
 * Generate a cryptographically random code verifier (43 chars, RFC 7636).
 * 32 random bytes → base64url-encoded = 43 characters.
 */
export async function generateCodeVerifier(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

/**
 * Generate S256 code challenge from a verifier.
 * SHA-256 hash of verifier → base64url-encoded.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(new Uint8Array(hash));
}

function base64urlEncode(buffer: Uint8Array): string {
  const binary = Array.from(buffer)
    .map(b => String.fromCharCode(b))
    .join('');
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd packages/auth-web && npx vitest run src/__tests__/pkce.test.ts`
Expected: ALL PASS

- [ ] **Step 11: Commit**

```bash
git add packages/auth-web/src/pkce.ts packages/auth-web/src/__tests__/pkce.test.ts
git commit -m "feat(auth-web): add PKCE verifier/challenge generation via Web Crypto API"
```

---

### Task 4: Token Store — Failing Tests

**Files:**
- Create: `packages/auth-web/src/__tests__/token-store.test.ts`

- [ ] **Step 12: Write the failing token store tests**

```ts
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
```

- [ ] **Step 13: Run tests to verify they fail**

Run: `cd packages/auth-web && npx vitest run src/__tests__/token-store.test.ts`
Expected: FAIL — module `../token-store.js` not found

---

### Task 5: Token Store — Implementation

**Files:**
- Create: `packages/auth-web/src/token-store.ts`

- [ ] **Step 14: Write the token store implementation**

```ts
import type { OAuthTokens } from './types.js';

/**
 * Pluggable token storage interface.
 * Implementations store and retrieve OAuth tokens keyed by provider ID.
 */
export interface TokenStore {
  get(providerId: string): OAuthTokens | null;
  set(providerId: string, tokens: OAuthTokens): void;
  remove(providerId: string): void;
}

/**
 * localStorage-backed token store.
 * Survives browser restarts. Default choice for long-lived sessions.
 */
export class LocalStorageTokenStore implements TokenStore {
  constructor(private readonly prefix: string = 'sb_auth_') {}

  get(providerId: string): OAuthTokens | null {
    const raw = localStorage.getItem(this.keyFor(providerId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OAuthTokens;
    } catch {
      return null;
    }
  }

  set(providerId: string, tokens: OAuthTokens): void {
    localStorage.setItem(this.keyFor(providerId), JSON.stringify(tokens));
  }

  remove(providerId: string): void {
    localStorage.removeItem(this.keyFor(providerId));
  }

  private keyFor(providerId: string): string {
    return `${this.prefix}${providerId}`;
  }
}

/**
 * sessionStorage-backed token store.
 * Clears when the tab closes. Better security for sensitive apps.
 */
export class SessionStorageTokenStore implements TokenStore {
  constructor(private readonly prefix: string = 'sb_auth_') {}

  get(providerId: string): OAuthTokens | null {
    const raw = sessionStorage.getItem(this.keyFor(providerId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OAuthTokens;
    } catch {
      return null;
    }
  }

  set(providerId: string, tokens: OAuthTokens): void {
    sessionStorage.setItem(this.keyFor(providerId), JSON.stringify(tokens));
  }

  remove(providerId: string): void {
    sessionStorage.removeItem(this.keyFor(providerId));
  }

  private keyFor(providerId: string): string {
    return `${this.prefix}${providerId}`;
  }
}
```

- [ ] **Step 15: Run tests to verify they pass**

Run: `cd packages/auth-web && npx vitest run src/__tests__/token-store.test.ts`
Expected: ALL PASS

- [ ] **Step 16: Commit**

```bash
git add packages/auth-web/src/token-store.ts packages/auth-web/src/__tests__/token-store.test.ts
git commit -m "feat(auth-web): add TokenStore interface with localStorage and sessionStorage implementations"
```

---

### Task 6: Redirect Handler — Failing Tests

**Files:**
- Create: `packages/auth-web/src/__tests__/redirect-handler.test.ts`

- [ ] **Step 17: Write the failing redirect handler tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { handleCallback, savePendingState, consumePendingState } from '../redirect-handler.js';
import type { PendingAuthState } from '../types.js';

const sampleState: PendingAuthState = {
  providerId: 'google-drive',
  codeVerifier: 'my-verifier-123',
  state: 'random-state-abc',
  createdAt: Date.now(),
};

describe('handleCallback', () => {
  it('returns null when URL has no auth params', () => {
    const originalLocation = window.location;
    // @ts-expect-error mock location search
    delete window.location;
    window.location = { ...originalLocation, search: '' };
    expect(handleCallback()).toBeNull();
    window.location = originalLocation;
  });

  it('extracts code and state from URL params', () => {
    const originalLocation = window.location;
    // @ts-expect-error mock location search
    delete window.location;
    window.location = { ...originalLocation, search: '?code=auth-code-xyz&state=state-abc' };
    const result = handleCallback();
    expect(result).not.toBeNull();
    expect(result!.code).toBe('auth-code-xyz');
    expect(result!.state).toBe('state-abc');
    window.location = originalLocation;
  });
});

describe('savePendingState / consumePendingState', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips pending state', () => {
    savePendingState(sampleState);
    const retrieved = consumePendingState(sampleState.state);
    expect(retrieved).toEqual(sampleState);
  });

  it('returns null for unknown state', () => {
    savePendingState(sampleState);
    expect(consumePendingState('wrong-state')).toBeNull();
  });

  it('clears state after consumption', () => {
    savePendingState(sampleState);
    consumePendingState(sampleState.state);
    expect(consumePendingState(sampleState.state)).toBeNull();
  });
});
```

- [ ] **Step 18: Run tests to verify they fail**

Run: `cd packages/auth-web && npx vitest run src/__tests__/redirect-handler.test.ts`
Expected: FAIL — module `../redirect-handler.js` not found

---

### Task 7: Redirect Handler — Implementation

**Files:**
- Create: `packages/auth-web/src/redirect-handler.ts`

- [ ] **Step 19: Write the redirect handler implementation**

```ts
import type { PendingAuthState } from './types.js';

const PKCE_STORAGE_PREFIX = 'sb_pkce_';

/**
 * Result of handling the OAuth callback.
 */
export interface CallbackResult {
  success: true;
  code: string;
  state: string;
}

/**
 * Handle the OAuth redirect callback on page load.
 * Call this in your app's entry point when the URL contains auth response params.
 *
 * @returns CallbackResult if this is an auth callback, null otherwise
 */
export function handleCallback(): CallbackResult | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (!code || !state) return null;

  return { success: true, code, state };
}

/**
 * Persist PKCE state before redirecting.
 * Stored in sessionStorage so it survives the page redirect.
 */
export function savePendingState(pending: PendingAuthState): void {
  sessionStorage.setItem(
    `${PKCE_STORAGE_PREFIX}${pending.state}`,
    JSON.stringify(pending),
  );
}

/**
 * Retrieve and clear PKCE state after callback.
 * Validates the state parameter matches before returning.
 */
export function consumePendingState(state: string): PendingAuthState | null {
  const key = `${PKCE_STORAGE_PREFIX}${state}`;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;

  sessionStorage.removeItem(key);

  try {
    return JSON.parse(raw) as PendingAuthState;
  } catch {
    return null;
  }
}
```

- [ ] **Step 20: Run tests to verify they pass**

Run: `cd packages/auth-web && npx vitest run src/__tests__/redirect-handler.test.ts`
Expected: ALL PASS

- [ ] **Step 21: Commit**

```bash
git add packages/auth-web/src/redirect-handler.ts packages/auth-web/src/__tests__/redirect-handler.test.ts
git commit -m "feat(auth-web): add OAuth redirect callback handler with PKCE state management"
```

---

### Task 8: BrowserOAuthClient — Failing Tests

**Files:**
- Create: `packages/auth-web/src/__tests__/oauth-client.test.ts`

- [ ] **Step 22: Write the failing OAuth client tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserOAuthClient } from '../oauth-client.js';
import type { OAuthProviderConfig } from '../types.js';
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
      tokenStore: mockTokenStore as any,
      fetchFn: mockFetch,
    });
  });

  describe('login()', () => {
    it('generates PKCE, saves state, and initiates redirect', async () => {
      const assignSpy = vi.spyOn(window, 'location', 'set');

      // Mock crypto.randomUUID for state generation
      const originalRandomUUID = crypto.randomUUID;
      crypto.randomUUID = () => 'test-state-uuid';

      // login() redirects, so the promise may not resolve normally
      // We catch the redirect by spying on location.assign
      const mockAssign = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { assign: mockAssign, search: '', href: '' },
        writable: true,
      });

      try {
        await client.login();
      } catch {
        // redirect may throw in test environment
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
          expiresAt: Date.now() + 30000, // 30s — within 60s buffer
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
      // Save pending state first
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
});
```

- [ ] **Step 23: Run tests to verify they fail**

Run: `cd packages/auth-web && npx vitest run src/__tests__/oauth-client.test.ts`
Expected: FAIL — module `../oauth-client.js` not found

---

### Task 9: BrowserOAuthClient — Implementation

**Files:**
- Create: `packages/auth-web/src/oauth-client.ts`

- [ ] **Step 24: Write the BrowserOAuthClient implementation**

```ts
import type { OAuthClient, OAuthTokens, OAuthProviderConfig } from './types.js';
import type { TokenStore } from './token-store.js';
import type { CallbackResult } from './redirect-handler.js';
import { LocalStorageTokenStore } from './token-store.js';
import { generateCodeVerifier, generateCodeChallenge } from './pkce.js';
import { savePendingState, consumePendingState } from './redirect-handler.js';
import { AuthRequiredError } from '@storage-bridge/core';

const REFRESH_BUFFER_MS = 60_000;

export interface BrowserOAuthClientOptions {
  config: OAuthProviderConfig;
  tokenStore?: TokenStore;
  fetchFn?: typeof fetch;
}

export class BrowserOAuthClient implements OAuthClient {
  private readonly config: OAuthProviderConfig;
  private readonly tokenStore: TokenStore;
  private readonly fetchFn: typeof fetch;

  constructor(options: BrowserOAuthClientOptions) {
    this.config = options.config;
    this.tokenStore = options.tokenStore ?? new LocalStorageTokenStore();
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async login(): Promise<void> {
    const codeVerifier = await generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = crypto.randomUUID();

    savePendingState({
      providerId: this.config.providerId,
      codeVerifier,
      state,
      createdAt: Date.now(),
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    if (this.config.extraAuthParams) {
      for (const [key, value] of Object.entries(this.config.extraAuthParams)) {
        params.set(key, value);
      }
    }

    const authUrl = `${this.config.authorizationEndpoint}?${params.toString()}`;
    window.location.assign(authUrl);
  }

  async completeAuthFlow(result: CallbackResult): Promise<void> {
    const pending = consumePendingState(result.state);
    if (!pending) {
      throw new AuthRequiredError(this.config.providerId);
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: result.code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: pending.codeVerifier,
    });

    const response = await this.fetchFn(this.config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
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

    this.tokenStore.set(this.config.providerId, tokens);
  }

  async getAccessToken(): Promise<string> {
    const tokens = this.tokenStore.get(this.config.providerId);
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

  async logout(): Promise<void> {
    this.tokenStore.remove(this.config.providerId);
  }

  private async refreshTokens(tokens: OAuthTokens): Promise<string> {
    if (!tokens.refreshToken) {
      this.tokenStore.remove(this.config.providerId);
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
      this.tokenStore.remove(this.config.providerId);
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

    this.tokenStore.set(this.config.providerId, newTokens);
    return newTokens.accessToken;
  }
}
```

- [ ] **Step 25: Run tests to verify they pass**

Run: `cd packages/auth-web && npx vitest run src/__tests__/oauth-client.test.ts`
Expected: ALL PASS

- [ ] **Step 26: Commit**

```bash
git add packages/auth-web/src/oauth-client.ts packages/auth-web/src/__tests__/oauth-client.test.ts
git commit -m "feat(auth-web): add BrowserOAuthClient with PKCE flow, token refresh, and tests"
```

---

### Task 10: Barrel Export and Final Verification

**Files:**
- Create: `packages/auth-web/src/index.ts`

- [ ] **Step 27: Create the barrel export**

```ts
export * from './types.js';
export * from './pkce.js';
export * from './token-store.js';
export * from './redirect-handler.js';
export * from './oauth-client.js';
```

- [ ] **Step 28: Run full test suite**

Run: `cd packages/auth-web && npx vitest run`
Expected: ALL PASS

- [ ] **Step 29: Run typecheck**

Run: `cd packages/auth-web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 30: Commit**

```bash
git add packages/auth-web/src/index.ts
git commit -m "feat(auth-web): add barrel export for @storage-bridge/auth-web"