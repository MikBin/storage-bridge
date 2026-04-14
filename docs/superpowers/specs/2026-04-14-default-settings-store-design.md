# DefaultSettingsStore Manager — Design Spec

## Overview

Implement `DefaultSettingsStore` — the main consumer-facing class in `@storage-bridge/core` that bridges the public `SettingsStore` API to a concrete `DocumentStoreProvider`. Lives in `src/manager.ts`.

## Context

TASK-3 is complete. The following are already in place:
- `types.ts` — `SettingsStore`, `DocumentStoreProvider`, `ProviderDescriptor`, `ProviderId`, `SettingsEnvelope`, `SettingsSummary`, `ConnectedProfile`, `PutOptions`
- `errors.ts` — `NotConnectedError`, `UnsupportedProviderError`, `ProviderUnavailableError`, `ConflictError`, etc.
- `providers/file-backed-document-provider.ts` and `providers/record-backed-document-provider.ts`

## Design

### Class: `DefaultSettingsStore`

Implements `SettingsStore`. Delegates all operations to a connected `DocumentStoreProvider`.

```ts
export class DefaultSettingsStore implements SettingsStore {
  private current: DocumentStoreProvider | null = null;

  constructor(private readonly registry: Map<ProviderId, ProviderDescriptor>) {}
}
```

### Constructor

Takes a `Map<ProviderId, ProviderDescriptor>` — the registry of available providers. The registry is immutable after construction (providers are registered, not added at runtime).

### Connection Lifecycle

**`connect(provider: ProviderId): Promise<void>`**
1. Look up `provider` in registry → throw `UnsupportedProviderError` if not found
2. Call `descriptor.isSupported()` → throw `ProviderUnavailableError` if false
3. If a provider is already connected, disconnect it first
4. Create provider via `descriptor.create()`
5. Call `provider.connect()`

**`disconnect(): Promise<void>`**
1. If connected, call `current.disconnect()`
2. Set `current = null`

**`currentProvider(): ProviderId | null`**
- Returns `current?.id ?? null`

**`isConnected(): Promise<boolean>`**
- If `current` is null, returns false
- Otherwise delegates to `current.isConnected()`

**`getProfile(): Promise<ConnectedProfile | null>`**
- If no current provider, returns null
- Otherwise delegates to `current.getProfile()`

### CRUD Operations

All CRUD methods call `ensureCurrent()` first, which throws `NotConnectedError` if `current` is null.

**`get<T>(key: string): Promise<SettingsEnvelope<T> | null>`**
- Delegates directly to `current.getDocument<T>(key)`

**`put<T>(key: string, data: T, options?: PutOptions): Promise<SettingsEnvelope<T>>**
1. Read existing document via `current.getDocument<T>(key)` (read-before-write)
2. Build envelope, merging existing `schemaVersion` and `revision`:
   ```ts
   const doc: SettingsEnvelope<T> = {
     key,
     schemaVersion: existing?.schemaVersion ?? 1,
     updatedAt: new Date().toISOString(),
     revision: existing?.revision,
     data,
   };
   ```
3. Delegate to `current.putDocument(doc, options)`
4. Return the result from `putDocument` (which includes updated revision/timestamp)

**`delete(key: string): Promise<void>`**
- Delegates to `current.deleteDocument(key)`

**`list(): Promise<SettingsSummary[]>`**
- Delegates to `current.listDocuments()`

### Error Handling

| Scenario | Error |
|----------|-------|
| Any CRUD without connected provider | `NotConnectedError` |
| `connect()` with unknown provider id | `UnsupportedProviderError` |
| `connect()` on unsupported runtime | `ProviderUnavailableError` |
| Provider raises revision conflict | `ConflictError` (propagated from provider) |

### Private Helper

```ts
private ensureCurrent(): void {
  if (!this.current) throw new NotConnectedError();
}
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/core/src/manager.ts` | **Create** — `DefaultSettingsStore` class |
| `packages/core/src/index.ts` | **Modify** — Add export for `./manager.js` |
| `packages/core/src/__tests__/manager.test.ts` | **Create** — Unit tests with fake provider |

## Testing Strategy

Unit tests using a fake `DocumentStoreProvider` that implements the interface with in-memory storage:

1. **Connection lifecycle** — connect, disconnect, currentProvider, isConnected, getProfile
2. **Connect with unknown provider** — throws UnsupportedProviderError
3. **Connect with unsupported runtime** — throws ProviderUnavailableError
4. **CRUD without connection** — throws NotConnectedError
5. **Get existing document** — returns envelope
6. **Get non-existent document** — returns null
7. **Put new document** — creates with schemaVersion 1
8. **Put existing document** — preserves schemaVersion, updates data
9. **Put with expectedRevision** — passes options through to provider
10. **Delete document** — delegates correctly
11. **List documents** — returns summaries
12. **Connect while already connected** — disconnects previous provider first

## Decisions

- **Read-before-write in `put()`**: Yes, fetch existing doc to merge `schemaVersion` and `revision`. Acceptable for a settings store (infrequent writes).
- **Auto-disconnect on reconnect**: Yes, calling `connect()` while already connected disconnects the previous provider first.
- **Registry immutability**: The registry map is provided at construction time and not modified.