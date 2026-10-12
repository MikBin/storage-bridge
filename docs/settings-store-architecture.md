# Cross-provider settings store architecture

Architecture reference for Storage Bridge: a client-side TypeScript library that
stores per-user app settings as keyed JSON documents in the user's own cloud
account, behind one API that spans Google Drive, Dropbox, OneDrive, iCloud, and
an in-memory local provider.

This document describes the code that is shipped in this repository (packages
under `packages/`, as of remediation steps 03-05 and 04-01). It is not a design
sketch: every type, error code, flow, and path below is taken from the sources.
The [README](../README.md) links here for the full design.

## Why the abstraction is document-oriented

A filesystem abstraction is tempting, but the providers do not line up cleanly:

- Google Drive offers a hidden `appDataFolder` space for app-specific files.
- OneDrive offers the app folder through the Graph `special/approot` root.
- Dropbox offers an app folder scoped to the OAuth app.
- iCloud is reached through CloudKit, which is a private record database with
  change tags, not a user-visible file folder.

The stable cross-provider contract is therefore a keyed JSON document store
(`SettingsEnvelope` values addressed by logical string keys), not a generic
file manager. Providers that are file-backed share one base adapter; the
record-backed CloudKit provider shares a second one.

## Design goals

- Consumer code never deals with provider-specific APIs.
- Providers can be added later without changing the consumer API.
- Least-privilege storage is preferred where the provider supports it
  (`appDataFolder`, `special/approot`, Dropbox app folder, CloudKit private
  database).
- Browser and React Native share the same core package; runtime-specific auth
  lives in dedicated adapter packages.
- Provider-specific auth and runtime constraints stay isolated in adapters.

## Monorepo structure

Real tree (pnpm + turbo workspace). Test files live in each package's
`src/__tests__/`; config manifests (`tsconfig.json`, `eslint.config.js`,
`vitest.config.ts`) and build outputs (`dist/`, `.turbo/`, `node_modules/`)
are omitted for brevity. Every path below exists in the repository.

```
storage-bridge/
|-- package.json
|-- pnpm-workspace.yaml
|-- turbo.json
|-- tsconfig.base.json
|-- README.md
|-- docs/
|   `-- settings-store-architecture.md
`-- packages/
    |-- core/                          @storage-bridge/core
    |   `-- src/
    |       |-- index.ts
    |       |-- types.ts
    |       |-- errors.ts
    |       |-- oauth.ts
    |       |-- manager.ts
    |       |-- registry.ts
    |       `-- providers/
    |           |-- file-backed-document-provider.ts
    |           |-- record-backed-document-provider.ts
    |           `-- local-document-store-provider.ts
    |-- auth-web/                      @storage-bridge/auth-web
    |   |-- README.md
    |   `-- src/
    |       |-- index.ts
    |       |-- types.ts
    |       |-- pkce.ts
    |       |-- token-store.ts
    |       |-- redirect-handler.ts
    |       `-- oauth-client.ts
    |-- auth-react-native/             @storage-bridge/auth-react-native
    |   `-- src/
    |       |-- index.ts
    |       |-- types.ts
    |       |-- secure-token-store.ts
    |       |-- deep-link-handler.ts
    |       `-- oauth-client.ts
    |-- provider-google-drive/         @storage-bridge/provider-google-drive
    |   `-- src/
    |       |-- index.ts
    |       |-- google-drive-mapper.ts
    |       `-- google-drive-provider.ts
    |-- provider-dropbox/              @storage-bridge/provider-dropbox
    |   `-- src/
    |       |-- index.ts
    |       |-- dropbox-mapper.ts
    |       `-- dropbox-provider.ts
    |-- provider-onedrive/             @storage-bridge/provider-onedrive
    |   `-- src/
    |       |-- index.ts
    |       |-- onedrive-mapper.ts
    |       `-- onedrive-provider.ts
    |-- provider-icloud/               @storage-bridge/provider-icloud
    |   `-- src/
    |       |-- index.ts
    |       |-- cloudkit-client.ts
    |       |-- cloudkit-js-client.ts
    |       |-- icloud-provider.ts
    |       `-- record-mapper.ts
    |-- testing/                       @storage-bridge/testing
    |   `-- src/
    |       |-- index.ts
    |       |-- types.ts
    |       |-- fixtures.ts
    |       |-- fake-provider.ts
    |       `-- provider-contract-tests.ts
    |-- eslint-config/                 @storage-bridge/eslint-config
    |   `-- index.js
    `-- typescript-config/             @storage-bridge/typescript-config
        `-- base.json
```

## Package responsibilities and dependency rules

| Package | Responsibility | Depends on |
|---|---|---|
| `@storage-bridge/core` | Types, error taxonomy, OAuth port + `TokenManager`, `DefaultSettingsStore`, `ProviderRegistry`, base adapters, local provider | nothing |
| `@storage-bridge/auth-web` | Browser OAuth 2.0 + PKCE adapter (redirect flow) | core |
| `@storage-bridge/auth-react-native` | Expo AuthRequest + deep-link adapter, secure token store | core; peers `expo-auth-session`, `expo-secure-store` |
| `@storage-bridge/provider-google-drive` | Drive `appDataFolder` adapter | core |
| `@storage-bridge/provider-dropbox` | Dropbox app-folder adapter | core |
| `@storage-bridge/provider-onedrive` | Graph `special/approot` adapter | core |
| `@storage-bridge/provider-icloud` | CloudKit private-database adapter + injected client port | core |
| `@storage-bridge/testing` | Fixtures, `FakeDocumentStoreProvider`, shared provider contract suite | core |
| `@storage-bridge/eslint-config` | Shared flat ESLint config | (tooling) |
| `@storage-bridge/typescript-config` | Shared `tsconfig` base | (tooling) |

Dependency rules (enforced by the workspace graph):

- Everything depends at most on `core`. Providers and auth packages never
  depend on each other; none of them peer-depend on an auth package.
- `auth-web` and `auth-react-native` are publishable, un-private packages
  (decision D4): the OAuth port lives in core, so adapters only need core.
- `auth-react-native` keeps Expo modules as optional peer dependencies and
  resolves `expo-secure-store` dynamically (see "Auth abstraction").

### Module format: ESM-only (decision D5)

Every runtime package declares `"type": "module"` and an exports map with
exactly two conditions:

```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  }
}
```

There is no CommonJS build and no ambiguous `default` export condition. The
audience is browser, React Native / Metro, and modern Node; all source uses
extensionful relative imports (`./types.js`).

## Public API (`@storage-bridge/core`)

### Core types (`src/types.ts`)

```ts
export type ProviderId =
  | 'google-drive'
  | 'dropbox'
  | 'onedrive'
  | 'icloud'
  | 'local';

export type Revision = string;

export interface SettingsEnvelope<T> {
  key: string;
  schemaVersion: number;
  updatedAt: string;
  revision?: Revision;
  data: T;
}

export interface SettingsSummary {
  key: string;
  updatedAt: string;
  revision?: Revision;
}

export interface ConnectedProfile {
  provider: ProviderId;
  accountId?: string;
  email?: string;
  displayName?: string;
}

export interface PutOptions {
  /** Optimistic expectation: mismatch or missing key rejects ConflictError. */
  expectedRevision?: Revision;
  /** Force a blind last-writer-wins write, skipping the precondition. */
  force?: boolean;
}

export interface SettingsStore {
  connect(provider: ProviderId): Promise<void>;
  disconnect(): Promise<void>;
  currentProvider(): ProviderId | null;
  isConnected(): Promise<boolean>;
  getProfile(): Promise<ConnectedProfile | null>;

  get<T>(key: string): Promise<SettingsEnvelope<T> | null>;
  put<T>(key: string, data: T, options?: PutOptions): Promise<SettingsEnvelope<T>>;
  delete(key: string): Promise<void>;
  list(): Promise<SettingsSummary[]>;
}

export interface DocumentStoreProvider {
  readonly id: ProviderId;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
  getProfile(): Promise<ConnectedProfile | null>;

  getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null>;
  putDocument<T>(doc: SettingsEnvelope<T>, options?: PutOptions): Promise<SettingsEnvelope<T>>;
  deleteDocument(key: string): Promise<void>;
  listDocuments(): Promise<SettingsSummary[]>;
}

export type ProviderCapability =
  | 'web'
  | 'react-native'
  | 'ios'
  | 'android'
  | 'offline-cache'
  | 'least-privilege-app-scope'
  | 'pkce-oauth'
  | 'apple-only-runtime';

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  capabilities: ProviderCapability[];
  isSupported(): Promise<boolean>;
  create(): DocumentStoreProvider;
}
```

A missing document is expressed by a `null` return from `get()`, never by an
error (the former `DocumentNotFoundError` was removed; see "Error model").

### Provider registry and store factory (`src/registry.ts`)

The registry is a thin `Map` subclass, and that is its entire contract:

```ts
export class ProviderRegistry extends Map<ProviderId, ProviderDescriptor> {
  constructor(descriptors: ProviderDescriptor[] = []);
  /** Registers a descriptor; a same-id registration silently overwrites. */
  public register(descriptor: ProviderDescriptor): void;
}

export function createSettingsStore(descriptors: ProviderDescriptor[]): SettingsStore;
```

Actual behavior, as shipped and tested:

- `ProviderRegistry` extends `Map`, so all Map semantics are available:
  `get`, `has`, `delete`, `clear`, `size`, iteration. There are no dedicated
  `unregister` or `getAll` methods - use the inherited Map API.
- `register()` is `this.set(descriptor.id, descriptor)`. Registering a second
  descriptor with an existing id **overwrites** the first without validation
  or error; the suite pins this overwrite behavior.
- `DefaultSettingsStore` accepts any `Map<ProviderId, ProviderDescriptor>` in
  its constructor, not just a `ProviderRegistry` instance.
- `createSettingsStore(descriptors)` builds a `ProviderRegistry` from the
  array and returns a `DefaultSettingsStore` over it.
- The provider packages do **not** ship descriptor factories. Consumers
  assemble `ProviderDescriptor` objects themselves (id, label, capabilities,
  an `isSupported()` runtime probe, and a `create()` factory), then hand them
  to `createSettingsStore` or the registry. `capabilities` is advisory
  metadata; runtime availability is gated by `isSupported()`.

`DefaultSettingsStore` (`src/manager.ts`) holds at most one connected
provider: `connect(id)` disconnects any current provider, then requires the
descriptor to exist (`UnsupportedProviderError`) and `isSupported()` to be
true (`ProviderUnavailableError`). Every data operation throws
`NotConnectedError` before `connect()`.

## Concurrency semantics (decision D2)

Optimistic concurrency by default, uniform across providers:

1. `put()` first reads the current document for the key. The revision it just
   read becomes the write's `expectedRevision`, so an interleaved remote
   writer rejects the put with `ConflictError` instead of being lost.
2. An explicit `options.expectedRevision` from the caller takes precedence
   over the read revision.
3. `options.force: true` skips the precondition entirely: a blind
   last-writer-wins overwrite.
4. An `expectedRevision` against a **missing key** rejects with
   `ConflictError`, uniformly (no provider treats "expect nothing" as
   satisfiable).
5. A write with no expectation at all is last-writer-wins.

`ConflictError.key` always carries the caller's **logical** (unencoded) key;
encoded remote file names never leak into error payloads.

Provider mapping of the precondition:

| Provider | Mechanism | Atomicity |
|---|---|---|
| Dropbox | upload `mode: {'.tag': 'update', update: rev}` on `/2/files/upload`; HTTP 409 maps to `ConflictError` | server-side precondition |
| OneDrive | `If-Match: <eTag>` header on the Graph PUT; HTTP 412 maps to `ConflictError` | server-side precondition |
| Google Drive | client-side check before create/update (Drive v3 media PATCH has no content precondition) | **best-effort only** - a concurrent writer landing between the check and the PATCH is not detected (TOCTOU window; documented trade-off) |
| iCloud (CloudKit) | record saved with `changeTag` set **only** from an explicit caller expectation - never from the document's own revision (which historically caused spurious conflicts) | server-side on CloudKit conflict codes |
| Local | in-process expectation check mirroring the shared contract fake; revisions are `rev-1`, `rev-2`, ... | in-memory |

## Error model

All failures surface as `SettingsStoreError` subclasses carrying a stable
string `code` and an optional `cause` (the raw transport/parse failure is
chained, never leaked as a bare `SyntaxError` or fetch error).

### Core error classes (`src/errors.ts`)

| Class | Code | Meaning |
|---|---|---|
| `NotConnectedError` | `NOT_CONNECTED` | data operation before `connect()` |
| `UnsupportedProviderError` | `UNSUPPORTED_PROVIDER` | id not in the registry |
| `AuthRequiredError` | `AUTH_REQUIRED` | no usable session; re-authenticate. Only this error should trigger a login redirect |
| `AuthExchangeError` | `AUTH_EXCHANGE` | token-endpoint transport or 5xx failure; the stored grant is preserved and the refresh retried later. Never a logout signal |
| `ConflictError` | `CONFLICT` | revision precondition failed; `key` = logical key |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` | descriptor's `isSupported()` returned false |

`DocumentNotFoundError` (`DOCUMENT_NOT_FOUND`) was **removed** (remediation
02-06): reads return `null` for missing documents.

### Base-adapter codes (`@storage-bridge/core`)

| Code | Thrown by |
|---|---|
| `DOCUMENT_CORRUPT` | `FileBackedDocumentProvider` when a remote payload is not valid JSON or not a settings-envelope object |

### Provider error codes

| Code | Provider / condition |
|---|---|
| `DROPBOX_READ_ERROR` | Dropbox download failed |
| `DROPBOX_META_CORRUPT` | `Dropbox-API-Result` header is non-JSON or wrong-shaped |
| `DROPBOX_WRITE_ERROR` | Dropbox upload failed |
| `DROPBOX_DELETE_ERROR` | Dropbox delete failed |
| `DROPBOX_LIST_ERROR` | Dropbox list/continue failed |
| `DRIVE_READ_ERROR` | Drive media download failed |
| `DRIVE_QUERY_ERROR` | Drive `files.list` name query failed |
| `DRIVE_CREATE_ERROR` | Drive multipart create failed |
| `DRIVE_UPDATE_ERROR` | Drive media PATCH failed |
| `DRIVE_DELETE_ERROR` | Drive delete failed |
| `DRIVE_LIST_ERROR` | Drive `files.list` failed |
| `ONEDRIVE_READ_ERROR` | Graph content download failed |
| `ONEDRIVE_WRITE_ERROR` | Graph PUT failed |
| `ONEDRIVE_DELETE_ERROR` | Graph DELETE failed |
| `ONEDRIVE_LIST_ERROR` | Graph children query failed |
| `ONEDRIVE_META_ERROR` | metadata round-trip after content read failed |
| `ICLOUD_REQUEST_ERROR` | CloudKit setUp/query/transport failure |
| `ICLOUD_RECORD_ERROR` | CloudKit fetch failed or record payload malformed |
| `ICLOUD_SAVE_ERROR` | CloudKit save failed |
| `ICLOUD_DELETE_ERROR` | CloudKit delete failed |

### Cross-cutting HTTP/server mapping

- HTTP 401/403 from any provider API maps to `AuthRequiredError` (only after
  the uniform pre-connect check, which throws `NotConnectedError` first when
  disconnected).
- Dropbox write 409 and OneDrive write 412 map to `ConflictError` (logical
  key payload).
- Missing remote state is idempotent: Dropbox delete 409, Drive 404 on
  read/delete, and CloudKit `NOT_FOUND`/`UNKNOWN_ITEM` on delete all return
  normally instead of throwing.
- CloudKit `serverErrorCode` mapping: `AUTHENTICATION_REQUIRED`(-ish) to
  `AuthRequiredError`; `CONFLICT`/`NOT_FOUND_EXISTING` to `ConflictError`
  (payload = logical record name); everything else wraps into the operation's
  `ICLOUD_*` code with the raw failure as `cause`. Errors that are already
  `SettingsStoreError`s pass through unwrapped (no double wrapping).

## Auth abstraction

### The OAuth port lives in core (decision D4)

`src/oauth.ts` exports the port and the shared token lifecycle:

- `OAuthTokens` (`accessToken`, `refreshToken?`, `expiresAt?`, `tokenType?`),
  `OAuthClient` (`login`, `logout`, `getAccessToken`, `getTokens`,
  `getAuthHeaders`), and `OAuthProviderConfig` (endpoints, clientId,
  redirectUri, scopes, `extraAuthParams`).
- `TokenStore` - persistence port with per-provider `get`/`set`/`remove`;
  both sync and async implementations are accepted (normalized with
  `Promise.resolve`).
- `TokenManager` - the single implementation behind both runtime clients:
  authorization-code exchange, expiry-aware access-token retrieval (60 s
  refresh buffer), and **single-flight refresh** so concurrent callers share
  one rotation instead of racing refresh tokens. Failure classification
  (remediation 02-06): token-endpoint 400/401/403 is a genuine rejection ->
  `AuthRequiredError` (a failing refresh clears the store exactly once);
  transport errors and any other non-ok status -> `AuthExchangeError` with an
  `HTTP <status>: <body excerpt>` (max 200 chars) chained as `cause`, grant
  preserved.
- `PendingAuthState`, `PENDING_STATE_TTL_MS` (10 minutes), and the pure
  `isPendingStateUsable(pending, providerId, now)` validator used at
  callback-consumption time (provider match + freshness; a future-dated or
  non-finite `createdAt` is rejected).
- `requireTokenEndpointSuccess(response, providerId)` - the response
  classifier above, exported from `@storage-bridge/core`'s `oauth.ts`
  module. The former `@storage-bridge/auth-web` re-export was removed by
  the phase-3 refactor (it had zero importers).

### Web: two-phase browser flow (`@storage-bridge/auth-web`)

`BrowserOAuthClient` owns the redirect flow and delegates the token lifecycle
to core's `TokenManager`:

1. **Start** - `client.login()`: generates a PKCE verifier + S256 challenge
   and a random `state`, persists the `PendingAuthState` via
   `savePendingState` (in `sessionStorage` under the `sb_pkce_` prefix,
   10-minute TTL, consumed on completion), then redirects the browser to the
   `authorizationEndpoint` (`response_type=code`, `code_challenge`,
   `code_challenge_method=S256`, `state`, scopes, plus any
   `extraAuthParams`).
2. **Complete** - on the callback route, `handleCallback()` parses the
   current URL into a discriminated `CallbackResult` (`callback` with
   code + state, `error` with the RFC 6749 error fields, or `null` when the
   URL is not an OAuth callback). `client.completeAuthFlow(result)` rejects
   with `AuthRequiredError` for error/non-callback results without touching
   the token endpoint; otherwise it consumes the pending state, validates it
   with `isPendingStateUsable` (stale-state replay cannot complete the
   exchange), and performs the code exchange through `TokenManager`.

Token stores exported: `InMemoryTokenStore` (default),
`LocalStorageTokenStore`, `SessionStorageTokenStore` - all implementing the
core `TokenStore` port. PKCE helpers (`generateCodeVerifier`,
`generateCodeChallenge`) and the redirect utilities (`handleCallback`,
`savePendingState`, `consumePendingState`) are exported as well.

### React Native (`@storage-bridge/auth-react-native`)

- `ReactNativeOAuthClient.create({ config, tokenStore? })` is the async
  construction entry point: with no explicit store it resolves
  `expo-secure-store` dynamically and wraps it in `SecureTokenStore`
  (keys prefixed `sb_auth_`). When no viable secure store resolves it
  rejects once with an actionable message - **never a silent plaintext
  fallback**. Calling the constructor directly without a `tokenStore`
  throws by design.
- `login()` runs the expo `AuthRequest` flow with `usePKCE: true`; a
  non-success or code-less result throws `AuthRequiredError`, a success
  exchanges the code through `TokenManager`.
- Deep links: `parseCallbackUrl(url)` mirrors the web's discriminated
  callback result; `buildRedirectUri(scheme, path = 'oauth/callback')`
  builds the redirect target; the pending-state registry is an in-process
  module-level map (the JS runtime instance survives the round trip through
  the system browser), consumed exactly once by `completeAuthFlow(callback)`
  with the same `isPendingStateUsable` freshness rule.
- `SecureStoreModule` is the injected structural surface of
  `expo-secure-store`, so the package stays loadable where the module cannot
  resolve (tests, plain Node).

### Token storage default and threat model (decision D1)

The web default is **in-memory token storage** (`InMemoryTokenStore`): no
token ever lands in `localStorage`, `sessionStorage`, or cookies, so an XSS
injection cannot exfiltrate a long-lived, replayable refresh token from
persistent web storage. The deliberate trade-off: tokens do not survive a
page reload - after a reload `getAccessToken()` rejects with
`AuthRequiredError` (it never throws during construction), and re-running
`login()` + `completeAuthFlow()` restores the session, typically without
re-prompting for credentials because the authorization server's session
cookie usually still exists.

Web-storage persistence across reloads is an explicit opt-in
(`LocalStorageTokenStore` / `SessionStorageTokenStore`) that re-opens exactly
the XSS exfiltration risk above; `sessionStorage` narrows the window (per
tab, cleared on close) but is equally script-readable while open. Mitigations
if you opt in: strict CSP, dependency auditing, short refresh-token
lifetimes, sender-constrained tokens where supported.

Even in the default setup, transient PKCE flow state (`code_verifier` +
`state`) is kept in `sessionStorage` under `sb_pkce_` for the duration of one
login redirect only (10-minute TTL, consumed on completion) - short-lived
flow state required to complete the exchange, not token material.

The full threat model is maintained in
[`packages/auth-web/README.md`](../packages/auth-web/README.md); this section
is a summary, not a duplicate.

## Provider adapters

### File-backed base adapter (`core/src/providers/file-backed-document-provider.ts`)

`FileBackedDocumentProvider` is the abstract base for Dropbox, Google Drive,
and OneDrive. It fixes the contract so concrete adapters implement only
transport:

- Key encoding: `encodeURIComponent(key) + '.json'` to a remote file name;
  decoding is the exact inverse. `findExactFileNameMatch()` provides
  exact-name disambiguation so a backend that returns candidate files for a
  lookup never resolves a prefix or fuzzy match (the historical Drive bug).
- Uniform pre-connect policy: every data operation rejects
  `NotConnectedError` based on the adapter's honest `isConnected()` answer -
  never a raw 401 masquerading as an auth failure.
- Payload validation: remote documents are untrusted input; anything that
  does not parse to a settings-envelope object rejects with the coded
  `DOCUMENT_CORRUPT` error, `cause` chained.
- Read overlay: the envelope's `key` is replaced with the caller's logical
  key and `revision` with the transport metadata's revision.
- The D2 conditional-write contract is stated on the abstract `writeFile`:
  implementations must treat `expectedRevision` as a precondition
  (`ConflictError` on mismatch **or missing key**) and `force` as the
  LWW opt-out.
- Listings are fully paginated (no silent truncation) - the truncated
  listing is what historically fed the duplicate-create corruption path.

### Google Drive (`@storage-bridge/provider-google-drive`)

`GoogleDriveProvider` stores documents as files in the Drive `appDataFolder`
space. Documents are JSON files named `<encodeURIComponent(key)>.json`;
revision is the file's `version`. Reads resolve the file by a paginated `name = '...' and
trashed=false` query (apostrophes and backslashes escaped) plus
exact-name matching, then download by file id; query/read failures throw
`DRIVE_QUERY_ERROR`/`DRIVE_READ_ERROR` rather than masquerading as
"not found". Writes are best-effort conditional (see the D2 table). All
list operations follow `nextPageToken` to exhaustion.

### Dropbox (`@storage-bridge/provider-dropbox`)

`DropboxProvider` stores documents in the app folder (list root `''`).
Revision is Dropbox's `rev`. Reads use `/2/files/download` with the
`Dropbox-API-Arg` header; the `Dropbox-API-Result` metadata header is treated
as untrusted input (`DROPBOX_META_CORRUPT` on garbage). Conditional writes
use the server-side `update` upload mode (D2). Deletes are idempotent on
409. Listings walk `has_more`/`cursor` via `list_folder/continue` to
exhaustion.

### OneDrive (`@storage-bridge/provider-onedrive`)

`OneDriveProvider` stores documents under the Graph `special/approot` root.
Revision is the item's `eTag` (falling back to `cTag`). Conditional writes
send `If-Match` (D2); 412 maps to `ConflictError`. Listings follow
`@odata.nextLink` to exhaustion. A content read is followed by one metadata
round-trip to obtain the current eTag (`ONEDRIVE_META_ERROR` on failure).

### Record-backed base adapter and iCloud (`@storage-bridge/provider-icloud`)

`RecordBackedDocumentProvider` (in core) is the abstract base for
record/document stores. It maps envelopes to records carrying `recordName`,
`changeTag`, and free-form fields, applies the same uniform pre-connect
policy, and implements the D2 rule that the stored precondition comes **only
from explicit caller expectations** - never from the document's own revision.

`ICloudProvider` extends it on top of the injected `CloudKitClient` port
(decision D3, matching the approved iCloud provider spec):

```ts
export interface CloudKitClient {
  setUp(config: CloudKitClientConfig): Promise<void>;
  tearDown(): Promise<void>;
  isAuthenticated(): boolean;
  fetchRecord(recordName: string, recordType: string): Promise<CloudKitRecordRaw | null>;
  saveRecord(record: CloudKitRecordRaw): Promise<CloudKitRecordRaw>;
  deleteRecord(recordName: string, recordType: string): Promise<void>;
  queryRecords(recordType: string): Promise<CloudKitRecordRaw[]>;
}
```

- The default implementation is `CloudKitJsClient` (CloudKit JS web adapter,
  which owns Apple web sign-in); tests inject the port-level fake. The
  default client requires Apple's web api token, and reaching the **private
  database** additionally requires an operator-provisioned
  `ckWebAuthToken`/web-auth-token - that provisioning is operator-side, not
  something the library can perform.
- Configuration: `containerIdentifier`, optional `environment`
  (`development`/`production`), optional `recordType`
  (default `SettingsDocument`). The envelope travels as JSON inside a single
  string record field; the record mapper validates payload shape
  (`ICLOUD_RECORD_ERROR` on garbage).
- Honest lifecycle: `isConnected()` is true only when the provider flag is
  set **and** `client.isAuthenticated()` - a session lost underneath the
  provider surfaces truthfully. `getProfile()` returns `{ provider: 'icloud' }`
  and nothing else; CloudKit exposes no account identity without a
  `discoverIdentity` user-facing call, so none is fabricated. While
  disconnected it returns `null`.
- `isAppleRuntime()` gates support through runtime detection
  (`globalThis.CloudKit` or the `__STORAGE_BRIDGE_ICLOUD_NATIVE__` native
  bridge marker) - never UA sniffing.

### Local provider (`core/src/providers/local-document-store-provider.ts`)

`LocalDocumentStoreProvider` is an in-memory `DocumentStoreProvider` with id
`'local'`: revisions are monotonic `rev-N` counters per key; D2 semantics
mirror the shared contract fake exactly (expectation rejects on mismatch or
missing key, `force` skips); `disconnect()` clears only the connection flag -
the store persists across disconnect/reconnect within the same instance.

## Testing support (`@storage-bridge/testing`)

- Fixtures: `createSettingsEnvelope`, `createSettingsSummary`,
  `createConnectedProfile`.
- `FakeDocumentStoreProvider` - the in-memory reference provider the local
  provider mirrors.
- `describeProviderContract(factory, options?)` - the shared provider
  contract suite. Scenario families (each owned by a remediation step):
  `honest-lifecycle` (02-08), `special-char-keys` (02-01),
  `conflict-missing-key` (02-02), `conflict-force` (02-02),
  `conflict-payload` (02-05), `disconnected-operations` (02-04),
  `error-taxonomy` (02-06), `pagination` (02-03), `server-errors` (02-03).
- A family a provider does not satisfy yet is listed in
  `pendingFamilies` (or per-scenario `pendingScenarios`); its scenarios
  register as `it.fails` scaffolds, and activating the family by removing it
  from the list is the owning step's acceptance gate.
- Default pending families are `pagination` and `server-errors`
  (`DEFAULT_PENDING_FAMILIES`): an in-memory store cannot emulate server
  pagination or 5xx faults, so those register as `it.todo` unless the caller
  provides the hooks `withListPageSize(pageSize)` and
  `runWithServerError(operation)`.

## Using the store

```ts
import { createSettingsStore } from '@storage-bridge/core';
import { GoogleDriveProvider } from '@storage-bridge/provider-google-drive';
import { BrowserOAuthClient } from '@storage-bridge/auth-web';

const auth = new BrowserOAuthClient({ config: driveOAuthConfig });

const store = createSettingsStore([
  {
    id: 'google-drive',
    label: 'Google Drive',
    capabilities: ['web', 'least-privilege-app-scope', 'pkce-oauth'],
    isSupported: async () => typeof window !== 'undefined',
    create: () => new GoogleDriveProvider({ auth }),
  },
]);

await store.connect('google-drive');

// Optimistic by default: a concurrent writer makes this reject ConflictError.
await store.put('ui/preferences', { theme: 'dark' });

// Explicit expectation: succeeds only if the stored revision matches.
await store.put('ui/preferences', { theme: 'light' }, { expectedRevision: 'rev-3' });

// Opt out into last-writer-wins.
await store.put('ui/preferences', { theme: 'system' }, { force: true });
```

The descriptor above is hand-assembled on purpose: provider packages ship
adapters, not descriptors, so applications decide capability metadata and
runtime probes.

## Review

- **Verdict:** NEEDS_REVISION
- **Date:** 2026-10-12
- **Reviewer:** Kilo (glm-5.3-flash) — architecture review of this doc validated against `packages/*` and `docs/superpowers/specs/*`
- **Scope:** design-vs-implementation drift, boundary quality, extensibility, cross-provider consistency, technology choices, document quality (DIVIO/Diataxis)
- **Summary of findings:**
  - Blocking (8): iCloud provider lacks the specced injected auth seam — CloudKit REST client has no user auth (`ckWebAuthToken`), so the private database is unreachable; CloudKit errors bypass the core error taxonomy (raw `Error`, no `SettingsStoreError`/`AuthRequiredError`); concurrency semantics diverge per provider (iCloud attaches stale `changeTag` on unconditional puts causing spurious conflicts; Drive/Dropbox use race-prone check-then-write; OneDrive uses `If-Match`); Google Drive `findFileByName` swallows all HTTP errors as "not found" (data appears deleted; duplicate files on write); iCloud contract test monkey-patches the class under test (real class fails the lifecycle contract); `iCloud.getProfile()` returns fabricated user identity; `ConflictError` carries encoded file names instead of logical keys; `LocalDocumentStoreProvider.disconnect()` wipes all data, contradicting the local-provider spec (store must persist across disconnect).
  - Suggestions (10): move the `OAuthClient` port into core (removes RN→auth-web and provider→auth-web coupling); ship per-provider `ProviderDescriptor` factories and fix the UA-based `isSupported()` heuristic; strengthen the contract suite (error-payload pinning, disconnected-state semantics, taxonomy conformance, pagination); add pagination (`has_more`/`@odata.nextLink`/`pageToken`/`continuationMarker`) and drop OneDrive's redundant metadata round-trip; document the browser two-phase redirect auth flow; validate pending OAuth state (providerId match + freshness); reconcile `ProviderRegistry` with its spec (duplicate-register validation); test key-encoding edge cases (`/`, `:`, `#`); add CI for the turbo pipelines; refresh this doc to match the shipped monorepo (provider-local, error codes, `ProviderRegistry`/`createSettingsStore`, record-backed `changeTag` semantics, token-storage threat model).
  - Also noted: dead `DocumentNotFoundError`, unpinned toolchain deps, mojibake in the monorepo tree, hardcoded CloudKit record type, write-only `ProviderCapability` union.
