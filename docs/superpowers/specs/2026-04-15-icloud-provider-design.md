# iCloud Provider Design

**Task:** TASK-14 — iCloud Provider
**Date:** 2026-04-15
**Status:** Draft
**Depends on:** TASK-3 (Provider Port and Base Adapters) — complete

## Overview

Implement `packages/provider-icloud` — a concrete `RecordBackedDocumentProvider` that stores keyed JSON documents in Apple's CloudKit private database. Unlike the file-backed providers (Google Drive, OneDrive, Dropbox), iCloud uses a record-oriented storage model via CloudKit. The provider wraps CloudKit operations behind a mockable client interface, maps CloudKit records to/from `CloudRecord`, and detects Apple-only runtime constraints via `isSupported()`.

## Design Decisions

### 1. Record-backed instead of file-backed

**Choice:** Extend `RecordBackedDocumentProvider` from `@storage-bridge/core`, not `FileBackedDocumentProvider`.

**Rationale:** CloudKit is a structured record database, not a filesystem. Apple positions it as a private-per-user cloud container. The `RecordBackedDocumentProvider` base class already handles the document-to-record mapping (`getDocument`/`putDocument`/`deleteDocument`/`listDocuments`), so we only need to implement `getRecord`/`saveRecord`/`removeRecord`/`listRecords`.

### 2. Mockable CloudKit client interface

**Choice:** Define a `CloudKitClient` interface with methods for the four record operations plus auth lifecycle. Inject a concrete implementation at construction time (CloudKit JS for web, native bridge for React Native). For testing, inject a mock.

**Rationale:** Follows the same dependency-injection pattern as `GoogleDriveProvider` (which injects `fetchFn`). Makes the provider fully testable without a real CloudKit environment. Consumers provide the platform-specific CloudKit implementation.

### 3. Package structure follows established pattern

**Choice:** Four source files plus index barrel:

```
packages/provider-icloud/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts
    ├── icloud-provider.ts
    ├── cloudkit-client.ts
    ├── record-mapper.ts
    └── __tests__/
        ├── icloud-provider.test.ts
        ├── icloud-provider-contract.test.ts
        ├── record-mapper.test.ts
        └── cloudkit-api-mock.ts
```

**Rationale:** Separates the CloudKit client interface (`cloudkit-client.ts`) from the record mapping logic (`record-mapper.ts`) from the provider class. Follows the same structure as other provider packages.

### 4. `record-mapper.ts` is a pure function module

**Choice:** Export `toCloudRecord(raw: CloudKitRecordRaw): CloudRecord` and `toCloudKitFields(record: CloudRecord): Record<string, unknown>` functions, plus a `CloudKitRecordRaw` type.

**Rationale:** Same pattern as `google-drive-mapper.ts` — pure data transformation, independently testable, no dependencies.

### 5. Optimistic concurrency via `changeTag`

**Choice:** CloudKit's `recordChangeTag` is the built-in concurrency mechanism. When `PutOptions.expectedRevision` is provided, `saveRecord` passes the `changeTag` to CloudKit, which will reject the save if the record has been modified since that tag was issued. Map the CloudKit conflict error to `ConflictError`.

**Rationale:** CloudKit has native optimistic concurrency via `changeTag`. Unlike Google Drive (which needed a pre-flight check), CloudKit handles this at the API level. The `RecordBackedDocumentProvider` base already sets `changeTag` from `doc.revision`.

### 6. `isSupported()` checks for Apple runtime

**Choice:** Export a standalone `isAppleRuntime(): boolean` function that checks for CloudKit availability. The default check looks for `window.CloudKit` (web) or a global native bridge marker. Returns `false` on non-Apple runtimes.

**Rationale:** CloudKit is only available on Apple platforms (iOS, macOS, via CloudKit JS on the web with an Apple developer container). The `ProviderDescriptor.isSupported()` function uses this to prevent registration on unsupported platforms.

### 7. No provider-specific auth file

**Choice:** Auth is handled entirely by the injected `CloudKitClient`. The provider doesn't manage tokens or sessions directly.

**Rationale:** Same rationale as Google Drive — auth concerns stay separated. The `CloudKitClient` interface handles authentication internally (CloudKit JS uses Apple ID sign-in, native uses the device iCloud account).

### 8. CloudKit record type naming

**Choice:** Use a configurable `recordType` parameter (default: `'SettingsDocument'`) in the provider constructor.

**Rationale:** CloudKit requires a record type for each zone. Making it configurable allows consumers to use a custom record type if needed, while providing a sensible default.

## File Structure

```
packages/provider-icloud/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                          # barrel: re-exports provider + client + mapper
    ├── icloud-provider.ts                # ICloudProvider class
    ├── cloudkit-client.ts                # CloudKitClient interface + CloudKitRecordRaw type
    ├── record-mapper.ts                  # toCloudRecord + toCloudKitFields
    └── __tests__/
        ├── icloud-provider.test.ts       # unit tests with mocked client
        ├── icloud-provider-contract.test.ts  # provider contract tests
        ├── record-mapper.test.ts         # pure mapping tests
        └── cloudkit-api-mock.ts          # in-memory mock CloudKit client
```

## CloudKitClient Interface

```ts
/** Raw CloudKit record shape from the API */
export interface CloudKitRecordRaw {
  recordName: string;
  recordType: string;
  recordChangeTag?: string;
  created?: { timestamp: number };
  modified?: { timestamp: number };
  fields: Record<string, unknown>;
  deleted?: boolean;
}

export interface CloudKitClientConfig {
  containerIdentifier: string;
  environment?: 'development' | 'production';
}

/**
 * Abstracts CloudKit record operations.
 * Injected into ICloudProvider — mock for tests, real CloudKit JS for web, native bridge for RN.
 */
export interface CloudKitClient {
  /** Authenticate and configure the CloudKit container */
  setUp(config: CloudKitClientConfig): Promise<void>;

  /** Fetch a single record by name from the private database */
  fetchRecord(recordName: string, recordType: string): Promise<CloudKitRecordRaw | null>;

  /** Save (create or update) a record */
  saveRecord(record: CloudKitRecordRaw): Promise<CloudKitRecordRaw>;

  /** Delete a record by name */
  deleteRecord(recordName: string, recordType: string): Promise<void>;

  /** Query all records of the given type */
  queryRecords(recordType: string): Promise<CloudKitRecordRaw[]>;

  /** Tear down the session */
  tearDown(): Promise<void>;

  /** Whether the client is currently authenticated */
  isAuthenticated(): boolean;
}
```

## record-mapper.ts

```ts
import type { CloudRecord } from '@storage-bridge/core';
import type { CloudKitRecordRaw } from './cloudkit-client.js';

/** Map a raw CloudKit API record to our CloudRecord type */
export function toCloudRecord(raw: CloudKitRecordRaw): CloudRecord {
  return {
    recordName: raw.recordName,
    modifiedAt: raw.modified?.timestamp
      ? new Date(raw.modified.timestamp).toISOString()
      : undefined,
    changeTag: raw.recordChangeTag,
    fields: raw.fields ?? {},
  };
}

/** Build CloudKit record fields from a CloudRecord for saving */
export function toCloudKitRecordRaw(
  record: CloudRecord,
  recordType: string,
): CloudKitRecordRaw {
  return {
    recordName: record.recordName,
    recordType,
    recordChangeTag: record.changeTag,
    fields: { ...record.fields },
  };
}
```

## ICloudProvider

```ts
import {
  RecordBackedDocumentProvider,
  type CloudRecord,
  type PutOptions,
  type ConnectedProfile,
  ConflictError,
  AuthRequiredError,
  SettingsStoreError,
} from '@storage-bridge/core';
import type { CloudKitClient, CloudKitClientConfig } from './cloudkit-client.js';
import { toCloudRecord, toCloudKitRecordRaw } from './record-mapper.js';

export interface ICloudProviderOptions {
  client: CloudKitClient;
  config: CloudKitClientConfig;
  recordType?: string;
}

export class ICloudProvider extends RecordBackedDocumentProvider {
  readonly id = 'icloud' as const;

  private readonly client: CloudKitClient;
  private readonly config: CloudKitClientConfig;
  private readonly recordType: string;
  private connected = false;

  constructor(options: ICloudProviderOptions) {
    super();
    this.client = options.client;
    this.config = options.config;
    this.recordType = options.recordType ?? 'SettingsDocument';
  }

  async connect(): Promise<void> {
    await this.client.setUp(this.config);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.client.tearDown();
    this.connected = false;
  }

  async isConnected(): Promise<boolean> {
    return this.connected && this.client.isAuthenticated();
  }

  async getProfile(): Promise<ConnectedProfile | null> {
    if (!await this.isConnected()) return null;
    return { provider: this.id };
  }

  protected async getRecord(key: string): Promise<CloudRecord | null> {
    const raw = await this.client.fetchRecord(key, this.recordType);
    if (!raw || raw.deleted) return null;
    return toCloudRecord(raw);
  }

  protected async saveRecord(record: CloudRecord, options?: PutOptions): Promise<CloudRecord> {
    const raw = toCloudKitRecordRaw(record, this.recordType);
    try {
      const saved = await this.client.saveRecord(raw);
      return toCloudRecord(saved);
    } catch (err: unknown) {
      if (isCloudKitConflictError(err)) {
        throw new ConflictError(record.recordName);
      }
      throw new SettingsStoreError(
        `CloudKit save failed: ${String(err)}`,
        'ICLOUD_SAVE_ERROR',
        err,
      );
    }
  }

  protected async removeRecord(key: string): Promise<void> {
    try {
      await this.client.deleteRecord(key, this.recordType);
    } catch (err: unknown) {
      // CloudKit throws for missing records — treat as idempotent
      if (!isCloudKitNotFoundError(err)) {
        throw new SettingsStoreError(
          `CloudKit delete failed: ${String(err)}`,
          'ICLOUD_DELETE_ERROR',
          err,
        );
      }
    }
  }

  protected async listRecords(): Promise<CloudRecord[]> {
    const raws = await this.client.queryRecords(this.recordType);
    return raws.filter(r => !r.deleted).map(toCloudRecord);
  }
}

function isCloudKitConflictError(err: unknown): boolean {
  return err instanceof Error && /CONFLICT|NOT_FOUND_EXISTING/i.test(err.message);
}

function isCloudKitNotFoundError(err: unknown): boolean {
  return err instanceof Error && /NOT_FOUND|UNKNOWN_ITEM/i.test(err.message);
}
```

## Runtime Detection

```ts
/**
 * Checks whether CloudKit is available in the current runtime.
 * Returns true if window.CloudKit exists (CloudKit JS loaded) or
 * a native iCloud bridge is detected.
 */
export function isAppleRuntime(): boolean {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as Record<string, unknown>;
    if (g.CloudKit) return true;
    if (g.__STORAGE_BRIDGE_ICLOUD_NATIVE__) return true;
  }
  return false;
}
```

## Testing

### Unit tests with mocked CloudKit client

All CloudKit interactions are tested via a mock `CloudKitClient`. Tests create an `ICloudProvider` with a `CloudKitApiMock` and verify behavior.

**Test categories:**

1. **Mapper tests** (`record-mapper.test.ts`) — pure transformation, no mocking:
   - Maps a full `CloudKitRecordRaw` to `CloudRecord` with all fields
   - Handles missing optional fields (changeTag, modified timestamp)
   - Converts timestamp number to ISO string
   - Round-trips through `toCloudRecord` → `toCloudKitRecordRaw`

2. **Provider lifecycle tests** (part of `icloud-provider.test.ts`):
   - `connect()` delegates to `client.setUp()`
   - `disconnect()` delegates to `client.tearDown()`
   - `isConnected()` returns true after connect
   - `isConnected()` returns false before connect
   - `getProfile()` returns profile with provider id when connected
   - `getProfile()` returns null when disconnected

3. **CRUD operation tests** (using mock client):
   - `getRecord()` returns mapped CloudRecord
   - `getRecord()` returns null for missing record
   - `getRecord()` returns null for deleted record
   - `saveRecord()` creates new record via client
   - `saveRecord()` updates existing record with changeTag
   - `removeRecord()` deletes via client
   - `removeRecord()` is no-op when record not found
   - `listRecords()` returns all non-deleted records

4. **Conflict handling tests**:
   - `saveRecord` maps CloudKit conflict error to `ConflictError`
   - `saveRecord` wraps non-conflict errors in `SettingsStoreError`

5. **Contract tests** (`icloud-provider-contract.test.ts`):
   - Run `describeProviderContract` from `@storage-bridge/testing` against `ICloudProvider` with `CloudKitApiMock`

### CloudKitApiMock

An in-memory mock that simulates CloudKit's private database:
- Stores records in a `Map<string, CloudKitRecordRaw>`
- Auto-generates `recordChangeTag` (incrementing string) on save
- `fetchRecord` returns `null` for missing records
- `deleteRecord` marks records as deleted (or throws for missing)
- `queryRecords` returns all non-deleted records

## Acceptance Criteria Mapping

| AC | How Satisfied |
|----|---------------|
| #1 Extends RecordBackedDocumentProvider | `ICloudProvider extends RecordBackedDocumentProvider` |
| #2 cloudkit-client.ts wraps CloudKit JS SDK or REST API | `CloudKitClient` interface abstracts all CloudKit operations |
| #3 record-mapper.ts maps CloudKit records to/from CloudRecord | `toCloudRecord()` and `toCloudKitRecordRaw()` in dedicated module |
| #4 Implements getRecord/saveRecord/removeRecord/listRecords | Protected methods implemented in `ICloudProvider` |
| #5 isSupported() returns false on non-Apple runtimes | `isAppleRuntime()` function checks for CloudKit availability |
| #6 Passes provider contract tests | `CloudKitApiMock` enables `describeProviderContract` suite |
| #7 Unit tests with mocked CloudKit client | All tests use injected `CloudKitClient` mock |

## Out of Scope

- Concrete CloudKit JS implementation — separate concern, consumer provides the client
- React Native native bridge — future package
- CloudKit zone management (custom zones) — default zone only
- CloudKit subscription/notifications
- Asset fields (CloudKit large binary data)
- Batch operations
- Rate limiting / retry logic