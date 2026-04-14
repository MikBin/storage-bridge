# Testing Package and Provider Contract Tests Design

**Task:** TASK-8 — Testing Package and Provider Contract Tests
**Date:** 2026-04-14
**Status:** Draft
**Depends on:** TASK-2 (Core Types and Error Classes)

## Overview

Create `packages/testing` with three modules: reusable test fixtures, an in-memory fake provider for consumer tests, and an exported conformance test suite that validates any `DocumentStoreProvider` implementation against the contract defined in `@storage-bridge/core`.

## Design Decisions

### 1. Single Entry Point for Contract Tests

**Choice:** Export `describeProviderContract(factory)` as the sole contract test API.

**Rationale:** Provider packages add contract testing with a single import and call. Internal organization uses Vitest `describe` blocks for readability and focused failure messages. If composable sub-suites are needed later, they can be added without breaking this API.

### 2. Factory Function Pattern

**Choice:** Contract tests accept a `() => DocumentStoreProvider` factory function, not a provider instance.

**Rationale:** Each test gets a fresh provider instance, ensuring test isolation. The factory pattern matches how `ProviderDescriptor.create()` works in the real registry. Tests are responsible for calling `connect()` and `disconnect()` as needed.

### 3. Fake Provider is a Full Implementation

**Choice:** `FakeDocumentStoreProvider` fully implements `DocumentStoreProvider` with an in-memory `Map`.

**Rationale:** Consumer tests (e.g., testing `DefaultSettingsStore` in TASK-4) need a real provider they can control. The fake supports revision tracking, profile simulation, and connect/disconnect state — making it suitable for unit testing any code that depends on the provider interface.

### 4. Fixtures are Factory Functions

**Choice:** Each fixture is a function that returns a fresh object with sensible defaults, accepting optional overrides via a partial parameter.

**Rationale:** Prevents test pollution from shared mutable references. The partial-override pattern (`{ ...defaults, ...overrides }`) is concise and type-safe.

### 5. Test Framework

**Choice:** Vitest, matching `packages/core`.

**Rationale:** Consistency across the monorepo. The contract test suite uses Vitest's `describe`/`it`/`expect` globals so provider packages also need Vitest to run the suite.

## File Structure

```
packages/testing/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                        # barrel re-export
    ├── fixtures.ts                     # factory functions for test data
    ├── fake-provider.ts                # in-memory DocumentStoreProvider
    ├── provider-contract-tests.ts      # exported conformance suite
    └── __tests__/
        ├── fixtures.test.ts            # fixture factory tests
        ├── fake-provider.test.ts       # fake provider behavior tests
        └── provider-contract-tests.test.ts  # meta-test: suite runs against fake
```

## Module Details

### `src/fixtures.ts`

Factory functions with sensible defaults and optional overrides:

```ts
import type { SettingsEnvelope, SettingsSummary, ConnectedProfile, ProviderId } from '@storage-bridge/core';

export function createSettingsEnvelope<T>(overrides?: Partial<SettingsEnvelope<T>>): SettingsEnvelope<T>;
export function createSettingsSummary(overrides?: Partial<SettingsSummary>): SettingsSummary;
export function createConnectedProfile(overrides?: Partial<ConnectedProfile>): ConnectedProfile;
```

Defaults:
- `createSettingsEnvelope`: key=`'test-key'`, schemaVersion=`1`, updatedAt=now, data=`{}`, no revision
- `createSettingsSummary`: key=`'test-key'`, updatedAt=now, no revision
- `createConnectedProfile`: provider=`'local'`, no accountId/email/displayName

### `src/fake-provider.ts`

In-memory `DocumentStoreProvider` implementation:

```ts
import type { DocumentStoreProvider, ProviderId, SettingsEnvelope, SettingsSummary, ConnectedProfile, PutOptions } from '@storage-bridge/core';

export class FakeDocumentStoreProvider implements DocumentStoreProvider {
  readonly id: ProviderId = 'local';
  private store: Map<string, SettingsEnvelope<unknown>>;
  private connected: boolean;
  private profile: ConnectedProfile | null;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
  getProfile(): Promise<ConnectedProfile | null>;

  getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null>;
  putDocument<T>(doc: SettingsEnvelope<T>, options?: PutOptions): Promise<SettingsEnvelope<T>>;
  deleteDocument(key: string): Promise<void>;
  listDocuments(): Promise<SettingsSummary[]>;
}
```

Key behaviors:
- `connect()` sets connected state to true, sets a default profile
- `disconnect()` clears connected state and profile, does NOT clear stored documents
- `getDocument()` returns `null` for missing keys (no error thrown)
- `putDocument()` auto-increments a revision counter per key (format: `"rev-N"`)
- `deleteDocument()` silently succeeds for missing keys
- `listDocuments()` returns summaries for all stored documents

### `src/provider-contract-tests.ts`

Exported conformance test suite:

```ts
import type { DocumentStoreProvider } from '@storage-bridge/core';

export type ProviderFactory = () => DocumentStoreProvider;

export function describeProviderContract(
  name: string,
  factory: ProviderFactory
): void;
```

The `name` parameter identifies the provider in test output (e.g., `"FakeDocumentProvider"`, `"GoogleDriveProvider"`).

#### Contract Test Groups

**Connect/Disconnect Lifecycle:**
- starts disconnected
- `connect()` transitions to connected
- `disconnect()` transitions back to disconnected
- `disconnect()` when already disconnected does not throw
- `getProfile()` returns null when disconnected, returns profile when connected

**Put/Get Round-trip:**
- `getDocument()` returns null for non-existent key
- `putDocument()` then `getDocument()` returns the same data
- `putDocument()` returns an envelope with the provided key and data
- multiple keys can coexist independently
- overwriting an existing key updates its data

**List Documents:**
- `listDocuments()` returns empty array when no documents exist
- `listDocuments()` returns summaries for all stored documents
- `listDocuments()` reflects documents added via `putDocument()`
- `listDocuments()` reflects documents removed via `deleteDocument()`

**Delete:**
- `deleteDocument()` removes a document so subsequent `getDocument()` returns null
- `deleteDocument()` does not throw for non-existent keys
- deleting one document does not affect others

**Revision Updates:**
- first `putDocument()` produces an envelope with a revision
- subsequent `putDocument()` for the same key produces a different revision
- revision is stable — reading the same document twice returns the same revision
- revision is reflected in `listDocuments()` summaries

**Conflict/Optimistic Concurrency (expectedRevision):**
- `putDocument()` with a matching `expectedRevision` succeeds
- `putDocument()` with a stale `expectedRevision` throws `ConflictError`
- `putDocument()` without `expectedRevision` always succeeds (unconditional write)

> Note: The contract suite always includes these tests. The fake provider implements revision checking to validate the contract. Real providers that don't support optimistic concurrency should still pass — they simply never throw `ConflictError`, meaning the "matching revision succeeds" test passes (since it won't throw) and the "stale revision throws" test would fail. Provider authors can handle this by either implementing basic revision checking or by using a future optional configuration flag to skip the conflict group.

## Package Configuration

### `package.json`

```json
{
  "name": "@storage-bridge/testing",
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

### `tsconfig.json`

```json
{
  "extends": "@storage-bridge/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

### `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

## Acceptance Criteria Mapping

| AC | How Satisfied |
|----|---------------|
| #1 src/fixtures.ts with factory functions | `createSettingsEnvelope`, `createSettingsSummary`, `createConnectedProfile` with defaults + overrides |
| #2 src/fake-provider.ts with in-memory provider | `FakeDocumentStoreProvider` implementing full `DocumentStoreProvider` |
| #3 src/provider-contract-tests.ts with exported suite | `describeProviderContract(name, factory)` function |
| #4 Contract tests validate all required behaviors | 6 test groups covering all scenarios listed in AC |
| #5 Package builds cleanly | `tsc` + `vitest run` pass |

## Out of Scope

- Mock OAuth clients or auth helpers — belongs in auth package tests
- Provider-specific integration tests — each provider package handles its own
- Performance or stress testing
- `FileBackedDocumentProvider` or `RecordBackedDocumentProvider` base class tests — TASK-3