# Auth React Native Package Design

**Task:** TASK-10 — Auth React Native Package
**Date:** 2026-04-14
**Status:** Draft
**Depends on:** TASK-2 (Core Types and Error Classes)

## Overview

Create `packages/auth-react-native` with native/hybrid OAuth auth for React Native apps. Satisfies the same `OAuthClient` interface as `auth-web` but uses native secure storage and deep linking instead of browser APIs.

## Design Decisions

### 1. Expo-First with Peer Dependency Flexibility

**Choice:** Build primarily against `expo-auth-session` and `expo-secure-store`. These are peer dependencies, not bundled — the consuming app provides them.

**Rationale:** Expo is the dominant React Native development model. `expo-auth-session` provides a built-in PKCE flow with deep link handling, eliminating most of the plumbing this package would need to implement. For bare React Native apps, users can use the `expo-auth-session` bare workflow or provide a compatible adapter. YAGNI: don't build a second implementation for `react-native-app-auth` until someone needs it.

### 2. Shared OAuthClient Interface

**Choice:** Re-export the `OAuthClient` and `OAuthTokens` types from `@storage-bridge/auth-web` rather than redefining them.

**Rationale:** The interfaces are identical — `login()`, `logout()`, `getAccessToken()`, `getTokens()`, `getAuthHeaders()`. Sharing them avoids drift. If `auth-web` is not a desirable dependency, the types move to `@storage-bridge/core` — but that's a refactor for later. For now, import from `auth-web`.

### 3. Secure Storage via expo-secure-store

**Choice:** `SecureTokenStore` wraps `expo-secure-store`'s `setItemAsync`/`getItemAsync`/`deleteItemAsync` with the same `TokenStore` interface as `auth-web`.

**Rationale:** iOS Keychain and Android Keystore under the hood. This is the standard secure storage for Expo apps. Keys are namespaced per provider (same `sb_auth_{providerId}` convention as `auth-web`).

### 4. Deep Link Handling via expo-auth-session

**Choice:** Delegate deep link handling to `expo-auth-session`'s built-in `AuthSession.startAsync()` which manages the redirect flow automatically. No custom deep link parsing needed.

**Rationale:** `expo-auth-session` handles the entire OAuth redirect flow including deep link resolution, PKCE, and state management. Building our own deep link handler would be reimplementing what Expo already does correctly. The `deep-link-handler.ts` module provides thin utilities for apps that need manual deep link parsing (e.g., non-Expo setups).

## File Structure

```
packages/auth-react-native/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                    # barrel re-export
    ├── oauth-client.ts             # ReactNativeOAuthClient implementing OAuthClient
    ├── deep-link-handler.ts        # Deep link parsing utilities
    ├── secure-token-store.ts       # TokenStore impl via expo-secure-store
    ├── types.ts                    # local types (ReactNativeOAuthConfig)
    └── __tests__/
        ├── deep-link-handler.test.ts
        ├── secure-token-store.test.ts
        └── oauth-client.test.ts
```

## Types

### `src/types.ts`

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

### Shared Types

`OAuthClient`, `OAuthTokens`, and `TokenStore` interfaces are imported from `@storage-bridge/auth-web`.

## Module Details

### `src/secure-token-store.ts`

```ts
import type { TokenStore } from '@storage-bridge/auth-web';
import type { OAuthTokens } from '@storage-bridge/auth-web';

/**
 * Secure token storage using expo-secure-store.
 * Delegates to iOS Keychain / Android Keystore.
 */
export class SecureTokenStore implements TokenStore {
  constructor(prefix?: string); // default: 'sb_auth_'

  get(providerId: string): Promise<OAuthTokens | null>;
  set(providerId: string, tokens: OAuthTokens): Promise<void>;
  remove(providerId: string): Promise<void>;
}
```

> **Interface note:** The `TokenStore` interface defined in `auth-web` uses synchronous methods (`get()`, `set()`, `remove()`). Native secure storage (`expo-secure-store`) is inherently async. During implementation, the `TokenStore` interface in `auth-web` should be updated to use `Promise` return types — this is a non-breaking change since `localStorage`/`sessionStorage` calls can trivially wrap in `Promise.resolve()`. This refactor will be included in the implementation plan.

### `src/deep-link-handler.ts`

```ts
/**
 * Parse an OAuth callback deep link URL.
 * Extracts authorization code and state from the URL query params.
 *
 * @param url The deep link URL (e.g., 'myapp://oauth/callback?code=xxx&state=yyy')
 * @returns Parsed result or null if not a valid callback URL
 */
export function parseCallbackUrl(url: string): { code: string; state: string } | null;

/**
 * Build the redirect URI for a given scheme and path.
 * Utility for apps that need to construct their deep link URI.
 */
export function buildRedirectUri(scheme: string, path?: string): string;
// default path: 'oauth/callback'
```

### `src/oauth-client.ts`

```ts
import type { OAuthClient, OAuthTokens, TokenStore } from '@storage-bridge/auth-web';
import type { ReactNativeOAuthConfig } from './types';

export interface ReactNativeOAuthClientOptions {
  config: ReactNativeOAuthConfig;
  tokenStore?: TokenStore; // defaults to SecureTokenStore
}

export class ReactNativeOAuthClient implements OAuthClient {
  constructor(options: ReactNativeOAuthClientOptions);

  async login(): Promise<void>;
  async logout(): Promise<void>;
  async getAccessToken(): Promise<string>;
  async getTokens(): Promise<OAuthTokens | null>;
  async getAuthHeaders(): Promise<Record<string, string>>;
}
```

#### `login()` Flow

Unlike `auth-web`, this does NOT redirect the page. It opens a native auth session:

1. Build the authorization URL with PKCE params
2. Call `AuthSession.startAsync({ authUrl })` from `expo-auth-session`
3. On success, exchange the authorization code for tokens via POST to token endpoint
4. Store tokens via `TokenStore`
5. On cancel or error, throw `AuthRequiredError`

#### `getAccessToken()` Flow

Same logic as `auth-web`:
1. Retrieve tokens from `TokenStore`
2. If no tokens → throw `AuthRequiredError`
3. If expired or within 60s buffer → refresh via token endpoint
4. Return `accessToken`

#### `getAuthHeaders()` / `logout()`

Identical behavior to `auth-web` counterparts.

## Package Configuration

```json
{
  "name": "@storage-bridge/auth-react-native",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
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

## Testing Strategy

Tests mock the Expo native modules. No real device or native code needed.

### `secure-token-store.test.ts`
- Stores and retrieves tokens by providerId (mocked `expo-secure-store`)
- Returns null for missing provider
- Removes tokens for specific provider
- Namespaced keys don't collide

### `deep-link-handler.test.ts`
- `parseCallbackUrl()` extracts code and state from valid deep link
- Returns null for URLs without auth params
- Returns null for malformed URLs
- `buildRedirectUri()` constructs correct URI from scheme and path

### `oauth-client.test.ts`
- `login()` calls `AuthSession.startAsync`, exchanges code, stores tokens
- `login()` throws on user cancel
- `getAccessToken()` returns valid token
- `getAccessToken()` auto-refreshes expired token
- `getAccessToken()` throws `AuthRequiredError` when no tokens
- `getAuthHeaders()` returns Bearer header
- `logout()` clears stored tokens

## Acceptance Criteria Mapping

| AC | How Satisfied |
|----|---------------|
| #1 React Native OAuthClient | `ReactNativeOAuthClient` in `oauth-client.ts` |
| #2 Deep link handler | `parseCallbackUrl()` + `buildRedirectUri()` in `deep-link-handler.ts` |
| #3 Secure token storage | `SecureTokenStore` wrapping `expo-secure-store` in `secure-token-store.ts` |
| #4 login/logout/getAccessToken/getAuthHeaders | `ReactNativeOAuthClient` implements full `OAuthClient` interface |
| #5 Unit tests for token storage and deep link parsing | 3 test files covering all modules |

## Out of Scope

- `react-native-app-auth` adapter (add when needed)
- Bare React Native without Expo
- Browser-based auth (handled by `auth-web`)
- Token revocation / server-side logout
- Biometric auth integration
- E2E tests on real devices