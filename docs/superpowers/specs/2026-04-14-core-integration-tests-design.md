# Core Integration Tests Design (TASK-6)

## Overview

End-to-end integration tests for the core package exercising the full `SettingsStore → DefaultSettingsStore → FakeDocumentStoreProvider` pipeline using real test infrastructure from `@storage-bridge/testing` and the `ProviderRegistry` from TASK-5.

## Scope

These are **integration tests**, not unit tests. They exercise the full wiring: registry → store → provider. The existing `manager.test.ts` unit tests remain as-is.

## Test File

`packages/core/src/__tests__/integration.test.ts`

Uses:
- `FakeDocumentStoreProvider` from `@storage-bridge/testing`
- `ProviderRegistry` from `./registry.js` (TASK-5)
- `createSettingsStore` from `./registry.js` (TASK-5)

## Test Cases

### 1. Full CRUD lifecycle

```
- Create registry with FakeDocumentStoreProvider descriptor
- createSettingsStore() returns working SettingsStore
- connect('local') succeeds
- put('settings', { theme: 'dark' }) returns envelope with key, schemaVersion=1, revision, data
- get('settings') returns same envelope
- list() returns [ { key: 'settings', updatedAt, revision } ]
- delete('settings') succeeds
- get('settings') returns null
- list() returns []
- disconnect() succeeds
- isConnected() returns false
```

### 2. Optimistic concurrency (ConflictError)

```
- Connect and put('doc', { v: 1 }) → get revision R1
- put('doc', { v: 2 }) → get revision R2 (R1 no longer current)
- put('doc', { v: 3 }, { expectedRevision: R1 }) → throws ConflictError
- get('doc') still returns { v: 2 } (write was rejected)
```

### 3. schemaVersion preservation across put/get cycles

```
- Connect and put('doc', { v: 1 }) → schemaVersion=1
- get('doc') → schemaVersion=1
- put('doc', { v: 2 }) → schemaVersion=1 (preserved from existing)
- Directly update the stored document's schemaVersion to 5 via provider
- put('doc', { v: 3 }) → schemaVersion=5 (preserved from existing)
- get('doc') → schemaVersion=5
```

### 4. Error handling

```
- CRUD operations before connect → NotConnectedError
- connect('unknown') → UnsupportedProviderError
- connect with provider where isSupported() returns false → ProviderUnavailableError
```

### 5. Connection switching

```
- Register two fake providers
- Connect to first, put data, disconnect
- Connect to second, verify clean state (no data from first)
- Connect back to first, verify data persists
```

## Design Decisions

- **Uses `@storage-bridge/testing` fake provider** — not an inline mock, tests real contract behavior
- **Uses `ProviderRegistry` / `createSettingsStore`** — exercises the factory path that consumers will use
- **Integration test file is separate** from existing unit tests — keeps unit tests fast and isolated
- **No mocking** — real instances wired together, testing actual behavior
- **`turbo test --filter=core`** must pass with all tests