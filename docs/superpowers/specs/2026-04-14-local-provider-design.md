# Local Provider — Design Spec

## Overview

Implement `packages/provider-local` — an in-memory `DocumentStoreProvider` for offline fallback, development, and testing. Uses an in-memory `Map` for storage and generates revision strings on each `putDocument`.

## Context

TASK-3 (types, errors, base adapters) and TASK-8 (testing package with contract tests) are complete. The contract tests in `@storage-bridge/testing` define the exact behavioral contract this provider must satisfy:

- **Connect/Disconnect lifecycle** — starts disconnected, transitions cleanly
- **Put/Get round-trip** — stores and retrieves data, handles non-existent keys
- **List** — returns summaries for all stored documents
- **Delete** — removes documents, no-op for non-existent keys
- **Revision updates** — generates revision on put, changes on update, stable on read
- **Conflict detection** — throws `ConflictError` when `expectedRevision` doesn't match current

The testing package already has a `FakeDocumentStoreProvider` with nearly identical logic. The local provider is the production-grade version in its own package.

## Design

### Package Structure

```
packages/provider-local/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts
    └── local-provider.ts
```

### Class: `LocalDocumentStoreProvider`

Implements `DocumentStoreProvider` directly (no base class needed — this is not file-backed or record-backed, it's pure in-memory).

```ts
export class LocalDocumentStoreProvider implements DocumentStoreProvider {
  readonly id: ProviderId = 'local';
  private store = new Map<string, SettingsEnvelope<unknown>>();
  private revisionCounters = new Map<string, number>();
  private connected = false;
  private profile: ConnectedProfile | null = null;
}
```

### Connection Lifecycle

- **`connect()`** — sets `connected = true`, creates profile `{ provider: 'local' }`
- **`disconnect()`** — sets `connected = false`, clears profile. **Does not clear store** — data persists across disconnect/reconnect within the same instance (useful for development).
- **`isConnected()`** — returns `connected` flag
- **`getProfile()`** — returns profile when connected, null when disconnected

### CRUD Operations

**`getDocument<T>(key)`** — returns stored envelope or null
**`putDocument<T>(doc, options?)`**:
1. If `options.expectedRevision` is provided, check against existing document's revision → throw `ConflictError` if mismatch
2. Increment revision counter for this key
3. Generate new revision string: `rev-{counter}`
4. Store envelope with updated `revision` and `updatedAt`
5. Return the stored envelope

**`deleteDocument(key)`** — removes from store, no-op if key doesn't exist
**`listDocuments()`** — returns `SettingsSummary[]` for all stored documents

### Revision Generation

Simple monotonically increasing counter per key: `rev-1`, `rev-2`, `rev-3`, etc. This is deterministic and testable.

### Error Handling

| Scenario | Error |
|----------|-------|
| `expectedRevision` doesn't match current revision | `ConflictError` |
| `deleteDocument` with non-existent key | No-op (no error) |
| `getDocument` with non-existent key | Returns `null` |

### Package Configuration

```json
{
  "name": "@storage-bridge/provider-local",
  "dependencies": {
    "@storage-bridge/core": "workspace:*"
  },
  "devDependencies": {
    "@storage-bridge/testing": "workspace:*",
    "vitest": "latest",
    "typescript": "latest"
  }
}
```

## Files to Create

| File | Action |
|------|--------|
| `packages/provider-local/package.json` | **Create** — package manifest |
| `packages/provider-local/tsconfig.json` | **Create** — extends root config |
| `packages/provider-local/vitest.config.ts` | **Create** — test configuration |
| `packages/provider-local/src/local-provider.ts` | **Create** — `LocalDocumentStoreProvider` class |
| `packages/provider-local/src/index.ts` | **Create** — public exports |
| `packages/provider-local/src/__tests__/contract.test.ts` | **Create** — runs `describeProviderContract` |

## Testing Strategy

1. **Contract tests** — import and run `describeProviderContract` from `@storage-bridge/testing`
2. **No additional unit tests needed** — the contract tests fully cover the required behavior

## Decisions

- **Not extending a base class**: The local provider is pure in-memory — it's neither file-backed nor record-backed, so it implements `DocumentStoreProvider` directly.
- **Data persists across disconnect/reconnect**: Data stays in the `Map` when disconnected; only the connection flag changes. This is useful for development and testing scenarios.
- **Counter-based revisions**: Simple `rev-{n}` format. Deterministic and easy to reason about.
- **Contract tests only**: The `describeProviderContract` suite covers all acceptance criteria. No additional unit tests unless we need provider-local-specific behavior beyond the contract.