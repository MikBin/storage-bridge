# Core Types and Error Classes Design

**Task:** TASK-2 — Core Types and Error Classes
**Date:** 2026-04-14
**Status:** Draft

## Overview

Create `packages/core` with shared type definitions, the `DocumentStoreProvider` interface, and a custom error hierarchy. This is the foundational package that all other packages depend on.

## Design Decisions

### 1. Include `DocumentStoreProvider` in Core

**Choice:** The `DocumentStoreProvider` interface lives in `packages/core/src/types.ts` alongside all other public types.

**Rationale:** `ProviderDescriptor` (also in TASK-2) has a `create(): DocumentStoreProvider` method. Defining them in the same package avoids circular or forward-reference issues. TASK-3 adds the abstract base classes (`FileBackedDocumentProvider`, `RecordBackedDocumentProvider`) that implement this interface.

### 2. Defer OAuth Types to Auth Packages

**Choice:** `OAuthClient` and `OAuthTokens` are NOT included in `packages/core`. They will be defined in their respective auth packages (`auth-web`, `auth-react-native`).

**Rationale:** Core never references these types. Providers receive an OAuthClient via dependency injection through constructors. Including them would add unnecessary coupling. YAGNI.

### 3. Error Hierarchy Pattern

**Choice:** All errors extend a common `SettingsStoreError` base class, which extends `Error`. Each subclass sets `name` via constructor and exposes a `code` string constant.

**Rationale:** Matches the architecture doc exactly. Enables both `instanceof` checks and `code`-based switching. The `name` property ensures correct behavior with `instanceof`.

### 4. File Structure

**Choice:** Three source files plus the barrel export.

```
packages/core/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts          # barrel re-export
    ├── types.ts          # all public types and interfaces
    ├── errors.ts         # error hierarchy
    └── __tests__/
        ├── types.test.ts
        └── errors.test.ts
```

**Rationale:** Minimal, focused files. Each file has a single clear purpose. Tests mirror the source structure.

### 5. Test Framework

**Choice:** Vitest, configured as a devDependency of `packages/core`.

**Rationale:** Fast, TypeScript-native, works well with the Turborepo `test` pipeline already defined. TASK-1 deferred test framework choice to TASK-2, and Vitest is the natural fit for a TypeScript monorepo.

## Types (`src/types.ts`)

All types from the architecture doc:

- `ProviderId` — union of provider string literals
- `Revision` — string type alias
- `SettingsEnvelope<T>` — full document with data payload
- `SettingsSummary` — lightweight listing entry
- `ConnectedProfile` — provider + optional user identity
- `PutOptions` — optimistic concurrency via `expectedRevision`
- `SettingsStore` — consumer-facing interface
- `DocumentStoreProvider` — internal provider port interface
- `ProviderCapability` — union of capability string literals
- `ProviderDescriptor` — registry entry with factory and metadata

## Errors (`src/errors.ts`)

Error hierarchy:

| Error | Code | When |
|-------|------|------|
| `SettingsStoreError` | varies | Base class for all library errors |
| `NotConnectedError` | `NOT_CONNECTED` | Operation attempted without a connected provider |
| `UnsupportedProviderError` | `UNSUPPORTED_PROVIDER` | Provider ID not found in registry |
| `DocumentNotFoundError` | `DOCUMENT_NOT_FOUND` | Document key doesn't exist |
| `ConflictError` | `CONFLICT` | Revision mismatch on put |
| `AuthRequiredError` | `AUTH_REQUIRED` | Provider requires authentication |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` | Provider not supported on current runtime |

Each subclass:
- Extends `SettingsStoreError`
- Sets `this.name` to the class name in constructor
- Passes a fixed message and code to `super()`
- Accepts relevant context (provider name, key) as constructor params

## Package Configuration

### `package.json`

```json
{
  "name": "@storage-bridge/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "devDependencies": {
    "typescript": "latest",
    "vitest": "latest",
    "@storage-bridge/typescript-config": "workspace:*",
    "@storage-bridge/eslint-config": "workspace:*"
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
| #1 src/types.ts exports all public types | All types listed above in `types.ts` |
| #2 src/errors.ts exports full error hierarchy | All 7 error classes in `errors.ts` |
| #3 src/index.ts re-exports all public types and errors | Barrel export of both modules |
| #4 Unit tests for error construction and instanceof checks | `errors.test.ts` covering all classes |
| #5 Package builds cleanly | `tsc` + `vitest run` pass |

## Out of Scope

- Abstract base classes (`FileBackedDocumentProvider`, `RecordBackedDocumentProvider`) — TASK-3
- `DefaultSettingsStore` implementation — TASK-4
- `ProviderRegistry` / `createSettingsStore` factory — TASK-5
- OAuth types (`OAuthClient`, `OAuthTokens`) — auth packages
- Provider implementations — TASK-7 through TASK-14