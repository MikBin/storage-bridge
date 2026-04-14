# Auth Web Package (Browser OAuth PKCE) Design

**Task:** TASK-9 — Auth Web Package (Browser OAuth PKCE)
**Date:** 2026-04-14
**Status:** Draft
**Depends on:** TASK-2 (Core Types and Error Classes)

## Overview

Create `packages/auth-web` with a browser-based OAuth 2.0 PKCE client that satisfies the `OAuthClient` interface deferred from `@storage-bridge/core`. This package handles the full auth lifecycle: PKCE challenge generation, redirect-based login, token exchange, secure storage, and automatic refresh.

## Design Decisions

### 1. Redirect-Based Auth Flow

**Choice:** `login()` initiates a full-page redirect to the provider's authorization endpoint. On return, `handleCallback()` exchanges the authorization code for tokens.

**Rationale:** The task AC explicitly says "login() initiates PKCE auth flow via redirect." Full-page redirect is the most reliable browser auth pattern — no popup blockers, no `postMessage` complexity, works across all browsers. The trade-off is the user leaves the app page, but this is the standard OAuth pattern.

### 2. Provider-Agnostic via Configuration

**Choice:** The `BrowserOAuthClient` accepts a provider-specific config object (endpoints, scopes, client ID) and handles the generic PKCE flow. It does not hardcode any provider endpoints.

**Rationale:** Google Drive, Dropbox, and OneDrive each have different authorization/token URLs and scopes. The auth plumbing (PKCE, token storage, refresh) is identical. A single configurable client keeps the package small and lets each provider package provide its own config.

### 3. Token Storage Strategy

**Choice:** Pluggable `TokenStore` interface with two built-in implementations: `LocalStorageTokenStore` (default) and `SessionStorageTokenStore`. Storage keys are namespaced per provider to support multiple concurrent providers.

**Rationale:** `localStorage` survives browser restarts (better UX for long-lived sessions). `sessionStorage` clears when the tab closes (better security for sensitive apps). Namespacing prevents collisions when multiple providers are configured. The interface allows custom implementations (e.g., IndexedDB, in-memory for testing).

### 4. PKCE via Web Crypto API

**Choice:** Use `crypto.subtle` (Web Crypto API) for both verifier generation and S256 challenge computation.

**Rationale:** Web Crypto is the browser standard for cryptographic operations — async, non-blocking, and not extractable. The PKCE spec recommends S256 as the mandatory challenge method. `crypto.getRandomValues` for verifier generation, `crypto.subtle.digest('SHA-256', ...)` for the challenge.

### 5. Auto-Refresh Strategy

**Choice:** `getAccessToken()` checks token expiry and refreshes transparently using the stored refresh token. Refresh happens when the token is expired or within a 60-second buffer before expiry.

**Rationale:** The task AC says "getAccessToken() returns valid token with auto-refresh." Eager refresh (before expiry) prevents failed API calls. A 60-second buffer is a common convention. If no refresh token is available and the token is expired, throw `AuthRequiredError`.

## File Structure

```
packages/auth-web/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                    # barrel re-export
    ├── oauth-client.ts             # BrowserOAuthClient implementing OAuthClient
    ├── pkce.ts                     # PKCE verifier/challenge generation
    ├── redirect-handler.ts         # OAuth redirect callback handling
    ├── token-store.ts              # TokenStore interface + implementations
    ├── types.ts                    # local types (OAuthProviderConfig, etc.)
    └── __tests__/
        ├── oauth-client.test.ts
        ├── pkce.test.ts
        ├── redirect-handler.test.ts
        └── token-store.test.ts
```

## Types

### `src/types.ts` — Local Types

```ts
import type { ProviderId } from '@storage-bridge/core';

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

### `OAuthClient` and `OAuthTokens` Interfaces

The `OAuthClient` and `OAuthTokens` interfaces from the architecture doc are defined in this package's `types.ts` since they were explicitly deferred from `@storage-bridge/core`:

```ts
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;  // Unix timestamp in ms
  tokenType?: 'Bearer';
}

export interface OAuthClient {
  login(): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string>;
  getTokens(): Promise<OAuthTokens | null>;
  getAuthHeaders(): Promise<Record<string, string>>;
}
```

## Module Details

### `src/pkce.ts`

PKCE helpers using Web Crypto API:

```ts
/** Generate a cryptographically random code verifier (43-128 chars, RFC 7636) */
export async function generateCodeVerifier(): Promise<string>;

/** Generate S256 code challenge from a verifier */
export async function generateCodeChallenge(verifier: string): Promise<string>;
```

Implementation notes:
- Verifier: 32 random bytes → base64url-encoded (43 characters)
- Challenge: SHA-256 hash of verifier → base64url-encoded
- Both functions are pure and async (Web Crypto is async)

### `src/token-store.ts`

```ts
import type { OAuthTokens } from './types';

/** Pluggable token storage interface */
export interface TokenStore {
  get(providerId: string): OAuthTokens | null;
  set(providerId: string, tokens: OAuthTokens): void;
  remove(providerId: string): void;
}

/** localStorage-backed token store (survives browser restart) */
export class LocalStorageTokenStore implements TokenStore {
  constructor(prefix?: string); // default: 'sb_auth_' (storage-bridge auth)
}

/** sessionStorage-backed token store (clears on tab close) */
export class SessionStorageTokenStore implements TokenStore {
  constructor(prefix?: string);
}
```

Storage key format: `{prefix}{providerId}` (e.g., `sb_auth_google-drive`).

### `src/redirect-handler.ts`

```ts
import type { OAuthProviderConfig, PendingAuthState } from './types';

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
export function handleCallback(): CallbackResult | null;

/**
 * Persist PKCE state before redirecting.
 * Internal use by BrowserOAuthClient — exported for testing.
 */
export function savePendingState(state: PendingAuthState): void;

/**
 * Retrieve and clear PKCE state after callback.
 * Internal use by BrowserOAuthClient — exported for testing.
 */
export function consumePendingState(state: string): PendingAuthState | null;
```

Implementation notes:
- Callback detection: checks URL for `code` and `state` query params
- State is stored in `sessionStorage` (key: `sb_pkce_{state}`) so it survives the redirect
- `consumePendingState` validates state matches and clears the entry

### `src/oauth-client.ts`

```ts
import type { OAuthClient, OAuthTokens } from './types';
import type { OAuthProviderConfig } from './types';
import type { TokenStore } from './token-store';

export interface BrowserOAuthClientOptions {
  config: OAuthProviderConfig;
  tokenStore?: TokenStore;  // defaults to LocalStorageTokenStore
  fetchFn?: typeof fetch;   // defaults to global fetch, injectable for testing
}

export class BrowserOAuthClient implements OAuthClient {
  constructor(options: BrowserOAuthClientOptions);

  async login(): Promise<void>;
  async logout(): Promise<void>;
  async getAccessToken(): Promise<string>;
  async getTokens(): Promise<OAuthTokens | null>;
  async getAuthHeaders(): Promise<Record<string, string>>;

  /**
   * Complete the auth flow after redirect.
   * Call this when handleCallback() returns a result.
   */
  async completeAuthFlow(result: CallbackResult): Promise<void>;
}
```

#### `login()` Flow

> **Note:** `login()` redirects the browser away from the app, so the returned `Promise<void>` never resolves in practice. The promise signature exists to satisfy the `OAuthClient` interface and for test scenarios where the redirect is mocked.

1. Generate PKCE verifier + challenge via `pkce.ts`
2. Generate random `state` string (CSRF protection)
3. Save `PendingAuthState` to sessionStorage via `redirect-handler.ts`
4. Build authorization URL with: `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256`, plus any `extraAuthParams`
5. Redirect browser via `window.location.assign(authUrl)`

#### `completeAuthFlow()` Flow

1. Retrieve and validate `PendingAuthState` via `consumePendingState(state)`
2. POST to token endpoint with: `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`
3. Parse response into `OAuthTokens`
4. Store tokens via `TokenStore`

#### `getAccessToken()` Flow

1. Retrieve tokens from `TokenStore`
2. If no tokens → throw `AuthRequiredError`
3. If `expiresAt` is set and current time is within 60s buffer → call `refreshTokens()`
4. If `expiresAt` is set and past expiry → call `refreshTokens()`
5. Return `accessToken`

#### `refreshTokens()` (private)

1. POST to token endpoint with: `grant_type=refresh_token`, `refresh_token`, `client_id`
2. Parse response, update stored tokens
3. If refresh fails (e.g., revoked token) → clear tokens, throw `AuthRequiredError`

#### `logout()` Flow

1. Remove tokens from `TokenStore`
2. Clear any pending auth state

## Package Configuration

### `package.json`

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

## Testing Strategy

### Unit Test Approach

Tests mock browser APIs (`crypto.subtle`, `localStorage`, `sessionStorage`, `fetch`, `window.location`) using Vitest's `vi.fn()` and `vi.stubGlobal()`. No real browser or network calls.

### `pkce.test.ts`
- Verifier is base64url-encoded and correct length
- Challenge is base64url-encoded SHA-256 of verifier
- Deterministic: same verifier → same challenge

### `token-store.test.ts`
- `LocalStorageTokenStore` stores and retrieves tokens by providerId
- `SessionStorageTokenStore` stores and retrieves tokens by providerId
- `remove()` clears tokens for specific provider
- Namespaced keys don't collide across providers
- `get()` returns null for missing provider

### `redirect-handler.test.ts`
- `handleCallback()` returns null when URL has no auth params
- `handleCallback()` extracts code and state from URL params
- `consumePendingState()` validates state and returns pending data
- `consumePendingState()` returns null for unknown state
- `savePendingState()` / `consumePendingState()` round-trip

### `oauth-client.test.ts`
- `login()` generates PKCE, saves state, and initiates redirect
- `completeAuthFlow()` exchanges code for tokens and stores them
- `getAccessToken()` returns stored token when valid
- `getAccessToken()` auto-refreshes when token is near expiry
- `getAccessToken()` throws AuthRequiredError when no tokens
- `getAuthHeaders()` returns `{ Authorization: 'Bearer <token>' }`
- `logout()` clears stored tokens
- `refreshTokens()` updates stored tokens on success
- `refreshTokens()` clears tokens and throws on failure

## Acceptance Criteria Mapping

| AC | How Satisfied |
|----|---------------|
| #1 Browser OAuthClient implementation | `BrowserOAuthClient` class in `oauth-client.ts` |
| #2 PKCE code verifier/challenge via Web Crypto | `generateCodeVerifier()` and `generateCodeChallenge()` in `pkce.ts` |
| #3 OAuth redirect callback handler | `handleCallback()` + `savePendingState()` + `consumePendingState()` in `redirect-handler.ts` |
| #4 Token storage in localStorage/sessionStorage | `TokenStore` interface + `LocalStorageTokenStore` + `SessionStorageTokenStore` in `token-store.ts` |
| #5 login() initiates PKCE auth flow via redirect | `BrowserOAuthClient.login()` — full PKCE redirect flow |
| #6 getAccessToken() returns valid token with auto-refresh | `BrowserOAuthClient.getAccessToken()` — checks expiry, refreshes within 60s buffer |
| #7 getAuthHeaders() returns Bearer header | `BrowserOAuthClient.getAuthHeaders()` — `{ Authorization: 'Bearer <token>' }` |
| #8 Unit tests for PKCE, token storage, refresh | 4 test files covering all modules |

## Out of Scope

- React Native auth — TASK-10 (`auth-react-native`)
- Provider-specific endpoint configuration — each provider package provides its own `OAuthProviderConfig`
- Popup-based auth flow
- Token revocation / server-side logout
- Multi-tab token synchronization
- End-to-end browser tests (Playwright) — can be added later for the playground app