# @storage-bridge/auth-web

Browser OAuth 2.0 + PKCE adapter for Storage Bridge. Owns the redirect flow
(authorize → callback → code exchange) and delegates the token lifecycle
(refresh, single-flight rotation, expiry handling) to the shared
`TokenManager` in `@storage-bridge/core`.

## Install

```sh
pnpm add @storage-bridge/auth-web
```

## Quick usage

```ts
import { BrowserOAuthClient, handleCallback } from '@storage-bridge/auth-web';
import type { OAuthProviderConfig } from '@storage-bridge/auth-web';

const config: OAuthProviderConfig = {
  providerId: 'google-drive',
  clientId: 'your-client-id',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  redirectUri: 'https://your.app/callback',
  scopes: ['https://www.googleapis.com/auth/drive.appdata'],
};

const client = new BrowserOAuthClient({ config });

// On your callback route: finish a redirect-based login.
const callback = handleCallback();
if (callback) {
  await client.completeAuthFlow(callback);
} else {
  // Elsewhere: start (or restart) a login. Redirects the browser.
  await client.login();
}

const headers = await client.getAuthHeaders(); // { Authorization: 'Bearer …' }
```

### Error contract

- `AuthRequiredError` — no usable session: the user must (re-)authenticate.
  Catch it and call `login()`. It is the **only** error that should trigger a
  redirect.
- `AuthExchangeError` — transport or 5xx failure talking to the token
  endpoint. The stored grant is preserved; retry later. Never log the user
  out for this.

## Token storage: in-memory by default

By default tokens live **only in JavaScript memory**
(`InMemoryTokenStore`). Nothing is written to `localStorage`,
`sessionStorage`, or cookies, so an XSS injection cannot exfiltrate
long-lived refresh tokens from persistent web storage.

The trade-off is honest and deliberate: **tokens do not survive a page
reload.** After a reload the new client instance finds an empty store and
`getAccessToken()` rejects with `AuthRequiredError` — it does not crash or
throw during construction. Re-running `login()` (a browser redirect) and
`completeAuthFlow()` restores the session transparently for the user apart
from the redirect round-trip. Because the authorization server session
(its cookie) usually still exists, the redirect typically completes without
re-prompting for credentials.

## Opt-in web storage

If your application accepts the risks below, token persistence across
reloads is available as an explicit opt-in:

```ts
import { BrowserOAuthClient, LocalStorageTokenStore } from '@storage-bridge/auth-web';

const client = new BrowserOAuthClient({
  config,
  tokenStore: new LocalStorageTokenStore(), // or SessionStorageTokenStore
});
```

### Threat model (opt-in)

- **Why in-memory is the default (D1):** any script that executes on the
  page — a compromised dependency, an unsanitized user input, a malicious
  browser extension — can read `localStorage`. With the historical default
  of persisting refresh tokens there, one XSS payload exfiltrated a
  long-lived credential that outlived the tab and worked until revoked.
  In-memory storage shrinks the blast radius of XSS to the lifetime of the
  page: tokens vanish on reload and are unreachable from persisted storage.
- **What opting in re-opens:** the same XSS can read the persisted tokens —
  including the refresh token, which is replayable across sessions and
  devices. `sessionStorage` narrows the window (per-tab, cleared when the
  tab closes) but is equally script-readable while the tab is open. Neither
  is a safe place for long-lived refresh tokens.
- **Mitigations if you opt in:** a strict Content-Security-Policy, dependency
  auditing, and — where the provider supports it — short refresh-token
  lifetimes and sender-constrained tokens. Prefer `SessionStorageTokenStore`
  over `LocalStorageTokenStore` to bound the exposure window.
- **Still in web storage even in the default setup:** the transient PKCE
  `code_verifier` and `state` are kept in `sessionStorage` under a
  `sb_pkce_` prefix for the duration of a login redirect only (10-minute
  TTL, consumed on completion). This is short-lived flow state, not token
  material, and it is required to complete the PKCE exchange.

## API

- `BrowserOAuthClient` — `login()`, `completeAuthFlow(result)`,
  `getAccessToken()`, `getTokens()`, `getAuthHeaders()`, `logout()`.
- `handleCallback()` — parses the current URL into a discriminated callback
  result (`callback` / `error` / `null`).
- Token stores: `InMemoryTokenStore` (default), `LocalStorageTokenStore`,
  `SessionStorageTokenStore` — all implement the `TokenStore` port
  (`get` / `set` / `remove` per `providerId`).
