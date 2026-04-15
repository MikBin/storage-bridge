# iCloud Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `packages/provider-icloud` — a `RecordBackedDocumentProvider` backed by CloudKit with full test coverage and contract conformance.

**Architecture:** The provider extends `RecordBackedDocumentProvider` from `@storage-bridge/core`, implementing four abstract record methods (`getRecord`, `saveRecord`, `removeRecord`, `listRecords`). CloudKit API calls are abstracted behind an injectable `CloudKitClient` interface for testability. A mapper module handles `CloudKitRecordRaw` ↔ `CloudRecord` conversion.

**Tech Stack:** TypeScript, Vitest, `@storage-bridge/core` (workspace), `@storage-bridge/testing` (workspace)

**Spec:** `docs/superpowers/specs/2026-04-15-icloud-provider-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/provider-icloud/package.json` | Package manifest with core + testing deps |
| Create | `packages/provider-icloud/tsconfig.json` | TypeScript config extending base |
| Create | `packages/provider-icloud/vitest.config.ts` | Vitest config |
| Create | `packages/provider-icloud/src/cloudkit-client.ts` | `CloudKitClient` interface, `CloudKitRecordRaw`, `CloudKitClientConfig` types |
| Create | `packages/provider-icloud/src/record-mapper.ts` | `toCloudRecord()`, `toCloudKitRecordRaw()` pure functions |
| Create | `packages/provider-icloud/src/icloud-provider.ts` | `ICloudProvider` class extending `RecordBackedDocumentProvider` |
| Create | `packages/provider-icloud/src/runtime.ts` | `isAppleRuntime()` runtime detection |
| Create | `packages/provider-icloud/src/index.ts` | Barrel re-exports |
| Create | `packages/provider-icloud/src/__tests__/record-mapper.test.ts` | Mapper unit tests |
| Create | `packages/provider-icloud/src/__tests__/cloudkit-api-mock.ts` | In-memory CloudKit mock |
| Create | `packages/provider-icloud/src/__tests__/icloud-provider.test.ts` | Provider unit tests |
| Create | `packages/provider-icloud/src/__tests__/icloud-provider-contract.test.ts` | Contract conformance tests |

---

### Task 1: Package Scaffold

**Files:**
- Create: `packages/provider-icloud/package.json`
- Create: `packages/provider-icloud/tsconfig.json`
- Create: `packages/provider-icloud/vitest.config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@storage-bridge/provider-icloud",
  "version": "1.0.0",
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
    "@storage-bridge/testing": "workspace:*",
    "@storage-bridge/typescript-config": "workspace:*",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`
Expected: Dependencies linked successfully

- [ ] **Step 5: Commit**

```bash
git add packages/provider-icloud/package.json packages/provider-icloud/tsconfig.json packages/provider-icloud/vitest.config.ts pnpm-lock.yaml
git commit -m "feat(icloud): scaffold provider-icloud package"
```

---

### Task 2: CloudKit Client Types

**Files:**
- Create: `packages/provider-icloud/src/cloudkit-client.ts`

- [ ] **Step 1: Create cloudkit-client.ts with types and interface**

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

- [ ] **Step 2: Verify types compile**

Run: `cd packages/provider-icloud && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/provider-icloud/src/cloudkit-client.ts
git commit -m "feat(icloud): add CloudKitClient interface and types"
```

---

### Task 3: Record Mapper — TDD

**Files:**
- Create: `packages/provider-icloud/src/record-mapper.ts`
- Create: `packages/provider-icloud/src/__tests__/record-mapper.test.ts`

- [ ] **Step 1: Write failing mapper tests**

```ts
import { describe, it, expect } from 'vitest';
import { toCloudRecord, toCloudKitRecordRaw } from '../record-mapper.js';
import type { CloudKitRecordRaw } from '../cloudkit-client.js';
import type { CloudRecord } from '@storage-bridge/core';

describe('record-mapper', () => {
  describe('toCloudRecord', () => {
    it('maps a full CloudKitRecordRaw to CloudRecord', () => {
      const raw: CloudKitRecordRaw = {
        recordName: 'settings-theme',
        recordType: 'SettingsDocument',
        recordChangeTag: 'tag-abc123',
        created: { timestamp: 1713139200000 },
        modified: { timestamp: 1713225600000 },
        fields: { theme: 'dark', fontSize: 14 },
      };
      const result = toCloudRecord(raw);
      expect(result.recordName).toBe('settings-theme');
      expect(result.changeTag).toBe('tag-abc123');
      expect(result.modifiedAt).toBe(new Date(1713225600000).toISOString());
      expect(result.fields).toEqual({ theme: 'dark', fontSize: 14 });
    });

    it('handles missing optional fields', () => {
      const raw: CloudKitRecordRaw = {
        recordName: 'minimal',
        recordType: 'SettingsDocument',
        fields: { data: true },
      };
      const result = toCloudRecord(raw);
      expect(result.recordName).toBe('minimal');
      expect(result.changeTag).toBeUndefined();
      expect(result.modifiedAt).toBeUndefined();
      expect(result.fields).toEqual({ data: true });
    });

    it('defaults fields to empty object when undefined', () => {
      const raw: CloudKitRecordRaw = {
        recordName: 'no-fields',
        recordType: 'SettingsDocument',
      };
      const result = toCloudRecord(raw);
      expect(result.fields).toEqual({});
    });
  });

  describe('toCloudKitRecordRaw', () => {
    it('maps a CloudRecord to CloudKitRecordRaw', () => {
      const record: CloudRecord = {
        recordName: 'settings-theme',
        changeTag: 'tag-xyz',
        fields: { theme: 'light' },
      };
      const result = toCloudKitRecordRaw(record, 'SettingsDocument');
      expect(result.recordName).toBe('settings-theme');
      expect(result.recordType).toBe('SettingsDocument');
      expect(result.recordChangeTag).toBe('tag-xyz');
      expect(result.fields).toEqual({ theme: 'light' });
    });

    it('copies fields without sharing references', () => {
      const record: CloudRecord = {
        recordName: 'test',
        fields: { key: 'value' },
      };
      const result = toCloudKitRecordRaw(record, 'SettingsDocument');
      result.fields.key = 'modified';
      expect(record.fields.key).toBe('value');
    });

    it('handles CloudRecord with no changeTag', () => {
      const record: CloudRecord = {
        recordName: 'new-record',
        fields: {},
      };
      const result = toCloudKitRecordRaw(record, 'SettingsDocument');
      expect(result.recordChangeTag).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('toCloudRecord then toCloudKitRecordRaw preserves key data', () => {
      const original: CloudKitRecordRaw = {
        recordName: 'round-trip',
        recordType: 'SettingsDocument',
        recordChangeTag: 'tag-1',
        modified: { timestamp: 1713225600000 },
        fields: { data: { nested: true } },
      };
      const cloudRecord = toCloudRecord(original);
      const back = toCloudKitRecordRaw(cloudRecord, 'SettingsDocument');
      expect(back.recordName).toBe('round-trip');
      expect(back.recordChangeTag).toBe('tag-1');
      expect(back.fields).toEqual({ data: { nested: true } });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/provider-icloud && pnpm test`
Expected: FAIL — module `../record-mapper.js` not found

- [ ] **Step 3: Implement record-mapper.ts**

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

/** Build a CloudKit record raw from a CloudRecord for saving */
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/provider-icloud && pnpm test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/provider-icloud/src/record-mapper.ts packages/provider-icloud/src/__tests__/record-mapper.test.ts
git commit -m "feat(icloud): add record mapper with tests"
```

---

### Task 4: CloudKit API Mock

**Files:**
- Create: `packages/provider-icloud/src/__tests__/cloudkit-api-mock.ts`

- [ ] **Step 1: Create the mock CloudKit client**

```ts
import type { CloudKitClient, CloudKitClientConfig, CloudKitRecordRaw } from '../cloudkit-client.js';

let nextTagCounter = 1;

function generateChangeTag(): string {
  return `tag-${nextTagCounter++}`;
}

export function createCloudKitApiMock(): { client: CloudKitClient; reset: () => void } {
  const records = new Map<string, CloudKitRecordRaw>();
  let authenticated = false;

  function reset(): void {
    records.clear();
    authenticated = false;
    nextTagCounter = 1;
  }

  const client: CloudKitClient = {
    async setUp(_config: CloudKitClientConfig): Promise<void> {
      authenticated = true;
    },

    async fetchRecord(recordName: string, _recordType: string): Promise<CloudKitRecordRaw | null> {
      return records.get(recordName) ?? null;
    },

    async saveRecord(record: CloudKitRecordRaw): Promise<CloudKitRecordRaw> {
      const existing = records.get(record.recordName);
      const now = Date.now();

      // Simulate CloudKit conflict: if existing record has a different changeTag than what we're sending
      if (existing && record.recordChangeTag && existing.recordChangeTag !== record.recordChangeTag) {
        throw new Error('CONFLICT: Record has been modified since last read');
      }

      const saved: CloudKitRecordRaw = {
        recordName: record.recordName,
        recordType: record.recordType,
        recordChangeTag: generateChangeTag(),
        created: existing?.created ?? { timestamp: now },
        modified: { timestamp: now },
        fields: { ...record.fields },
      };
      records.set(record.recordName, saved);
      return saved;
    },

    async deleteRecord(recordName: string, _recordType: string): Promise<void> {
      const existing = records.get(recordName);
      if (!existing) {
        throw new Error('NOT_FOUND: Record does not exist');
      }
      records.delete(recordName);
    },

    async queryRecords(recordType: string): Promise<CloudKitRecordRaw[]> {
      return Array.from(records.values()).filter(
        r => r.recordType === recordType && !r.deleted,
      );
    },

    async tearDown(): Promise<void> {
      authenticated = false;
    },

    isAuthenticated(): boolean {
      return authenticated;
    },
  };

  return { client, reset };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/provider-icloud/src/__tests__/cloudkit-api-mock.ts
git commit -m "test(icloud): add CloudKit API mock for testing"
```

---

### Task 5: ICloudProvider — TDD

**Files:**
- Create: `packages/provider-icloud/src/icloud-provider.ts`
- Create: `packages/provider-icloud/src/__tests__/icloud-provider.test.ts`

- [ ] **Step 1: Write failing provider tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ICloudProvider } from '../icloud-provider.js';
import { createCloudKitApiMock } from './cloudkit-api-mock.js';
import { ConflictError, SettingsStoreError } from '@storage-bridge/core';
import type { CloudKitClient, CloudKitClientConfig, CloudKitRecordRaw } from '../cloudkit-client.js';
import type { CloudRecord } from '@storage-bridge/core';

function createProvider() {
  const { client, reset } = createCloudKitApiMock();
  const config: CloudKitClientConfig = {
    containerIdentifier: 'com.test.container',
    environment: 'development',
  };
  const provider = new ICloudProvider({ client, config });
  return { provider, client, reset, config };
}

describe('ICloudProvider', () => {
  describe('lifecycle', () => {
    it('starts disconnected', async () => {
      const { provider } = createProvider();
      expect(await provider.isConnected()).toBe(false);
    });

    it('connect() transitions to connected', async () => {
      const { provider } = createProvider();
      await provider.connect();
      expect(await provider.isConnected()).toBe(true);
    });

    it('disconnect() transitions back to disconnected', async () => {
      const { provider } = createProvider();
      await provider.connect();
      await provider.disconnect();
      expect(await provider.isConnected()).toBe(false);
    });

    it('disconnect() when already disconnected does not throw', async () => {
      const { provider } = createProvider();
      await expect(provider.disconnect()).resolves.toBeUndefined();
    });

    it('getProfile() returns null when disconnected', async () => {
      const { provider } = createProvider();
      expect(await provider.getProfile()).toBeNull();
    });

    it('getProfile() returns profile with provider id when connected', async () => {
      const { provider } = createProvider();
      await provider.connect();
      const profile = await provider.getProfile();
      expect(profile).not.toBeNull();
      expect(profile!.provider).toBe('icloud');
    });
  });

  describe('record CRUD', () => {
    it('getRecord returns null for missing record', async () => {
      const { provider } = createProvider();
      await provider.connect();
      const result = await provider.getRecord('nonexistent');
      expect(result).toBeNull();
    });

    it('saveRecord creates and returns a CloudRecord', async () => {
      const { provider } = createProvider();
      await provider.connect();
      const record: CloudRecord = {
        recordName: 'settings',
        fields: { theme: 'dark' },
      };
      const saved = await provider.saveRecord(record);
      expect(saved.recordName).toBe('settings');
      expect(saved.changeTag).toBeDefined();
      expect(saved.fields).toEqual({ theme: 'dark' });
    });

    it('getRecord retrieves a saved record', async () => {
      const { provider } = createProvider();
      await provider.connect();
      await provider.saveRecord({ recordName: 'test', fields: { value: 42 } });
      const result = await provider.getRecord('test');
      expect(result).not.toBeNull();
      expect(result!.recordName).toBe('test');
      expect(result!.fields).toEqual({ value: 42 });
    });

    it('saveRecord updates an existing record with a new changeTag', async () => {
      const { provider } = createProvider();
      await provider.connect();
      const v1 = await provider.saveRecord({ recordName: 'doc', fields: { v: 1 } });
      const v2 = await provider.saveRecord({
        recordName: 'doc',
        changeTag: v1.changeTag,
        fields: { v: 2 },
      });
      expect(v2.changeTag).not.toBe(v1.changeTag);
      expect(v2.fields).toEqual({ v: 2 });
    });

    it('removeRecord deletes a record', async () => {
      const { provider } = createProvider();
      await provider.connect();
      await provider.saveRecord({ recordName: 'to-delete', fields: {} });
      await provider.removeRecord('to-delete');
      const result = await provider.getRecord('to-delete');
      expect(result).toBeNull();
    });

    it('removeRecord is no-op for missing record', async () => {
      const { provider } = createProvider();
      await provider.connect();
      await expect(provider.removeRecord('never-existed')).resolves.toBeUndefined();
    });

    it('listRecords returns all saved records', async () => {
      const { provider } = createProvider();
      await provider.connect();
      await provider.saveRecord({ recordName: 'a', fields: {} });
      await provider.saveRecord({ recordName: 'b', fields: {} });
      const records = await provider.listRecords();
      expect(records).toHaveLength(2);
      const names = records.map(r => r.recordName).sort();
      expect(names).toEqual(['a', 'b']);
    });

    it('listRecords returns empty array when no records exist', async () => {
      const { provider } = createProvider();
      await provider.connect();
      const records = await provider.listRecords();
      expect(records).toEqual([]);
    });
  });

  describe('conflict handling', () => {
    it('saveRecord throws ConflictError on changeTag mismatch', async () => {
      const { provider } = createProvider();
      await provider.connect();
      await provider.saveRecord({ recordName: 'conflict', fields: { v: 1 } });
      await expect(
        provider.saveRecord({
          recordName: 'conflict',
          changeTag: 'stale-tag',
          fields: { v: 2 },
        }),
      ).rejects.toThrow(ConflictError);
    });

    it('saveRecord wraps non-conflict errors in SettingsStoreError', async () => {
      const { client } = createCloudKitApiMock();
      // Override saveRecord to throw a generic error
      const originalSave = client.saveRecord.bind(client);
      client.saveRecord = async (_record: CloudKitRecordRaw) => {
        throw new Error('INTERNAL_ERROR: Something broke');
      };
      const config: CloudKitClientConfig = { containerIdentifier: 'test' };
      const provider = new ICloudProvider({ client, config });
      await provider.connect();
      await expect(
        provider.saveRecord({ recordName: 'fail', fields: {} }),
      ).rejects.toThrow(SettingsStoreError);
    });
  });

  describe('configurable record type', () => {
    it('uses default recordType when not specified', async () => {
      const { provider } = createProvider();
      await provider.connect();
      await provider.saveRecord({ recordName: 'default-type', fields: {} });
      // Verify via listRecords that the record was saved with default type
      const records = await provider.listRecords();
      expect(records).toHaveLength(1);
    });

    it('uses custom recordType when specified', async () => {
      const { client } = createCloudKitApiMock();
      const config: CloudKitClientConfig = { containerIdentifier: 'test' };
      const provider = new ICloudProvider({ client, config, recordType: 'CustomType' });
      await provider.connect();
      await provider.saveRecord({ recordName: 'custom', fields: {} });
      // The mock's queryRecords filters by recordType — this confirms the type is passed through
      const records = await provider.listRecords();
      expect(records).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/provider-icloud && pnpm test`
Expected: FAIL — module `../icloud-provider.js` not found

- [ ] **Step 3: Implement icloud-provider.ts**

```ts
import {
  RecordBackedDocumentProvider,
  type CloudRecord,
  type PutOptions,
  type ConnectedProfile,
  ConflictError,
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
    if (!(await this.isConnected())) return null;
    return { provider: this.id };
  }

  protected async getRecord(key: string): Promise<CloudRecord | null> {
    const raw = await this.client.fetchRecord(key, this.recordType);
    if (!raw || raw.deleted) return null;
    return toCloudRecord(raw);
  }

  protected async saveRecord(record: CloudRecord, _options?: PutOptions): Promise<CloudRecord> {
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/provider-icloud && pnpm test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/provider-icloud/src/icloud-provider.ts packages/provider-icloud/src/__tests__/icloud-provider.test.ts
git commit -m "feat(icloud): add ICloudProvider with unit tests"
```

---

### Task 6: Runtime Detection

**Files:**
- Create: `packages/provider-icloud/src/runtime.ts`
- Test: `packages/provider-icloud/src/__tests__/icloud-provider.test.ts` (add tests to existing file)

- [ ] **Step 1: Write failing tests for isAppleRuntime**

Add import at the top of `packages/provider-icloud/src/__tests__/icloud-provider.test.ts` (alongside existing imports):

```ts
import { isAppleRuntime } from '../runtime.js';
```

Append the following test suite at the end of the file:

```ts
describe('isAppleRuntime', () => {
  const originalGlobalThis = globalThis;

  afterEach(() => {
    // Clean up any globals we set
    const g = globalThis as Record<string, unknown>;
    delete g.CloudKit;
    delete g.__STORAGE_BRIDGE_ICLOUD_NATIVE__;
  });

  it('returns false when no CloudKit globals exist', () => {
    expect(isAppleRuntime()).toBe(false);
  });

  it('returns true when window.CloudKit exists', () => {
    (globalThis as Record<string, unknown>).CloudKit = {};
    expect(isAppleRuntime()).toBe(true);
  });

  it('returns true when native bridge marker exists', () => {
    (globalThis as Record<string, unknown>).__STORAGE_BRIDGE_ICLOUD_NATIVE__ = true;
    expect(isAppleRuntime()).toBe(true);
  });

  it('returns false after globals are removed', () => {
    (globalThis as Record<string, unknown>).CloudKit = {};
    delete (globalThis as Record<string, unknown>).CloudKit;
    expect(isAppleRuntime()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/provider-icloud && pnpm test`
Expected: FAIL — module `../runtime.js` not found

- [ ] **Step 3: Implement runtime.ts**

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/provider-icloud && pnpm test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/provider-icloud/src/runtime.ts packages/provider-icloud/src/__tests__/icloud-provider.test.ts
git commit -m "feat(icloud): add isAppleRuntime detection with tests"
```

---

### Task 7: Barrel Export and Contract Tests

**Files:**
- Create: `packages/provider-icloud/src/index.ts`
- Create: `packages/provider-icloud/src/__tests__/icloud-provider-contract.test.ts`

- [ ] **Step 1: Create index.ts barrel export**

```ts
export * from './cloudkit-client.js';
export * from './record-mapper.js';
export * from './icloud-provider.js';
export * from './runtime.js';
```

- [ ] **Step 2: Write contract tests**

```ts
import { describe } from 'vitest';
import { describeProviderContract } from '@storage-bridge/testing';
import { ICloudProvider } from '../icloud-provider.js';
import { createCloudKitApiMock } from './cloudkit-api-mock.js';
import type { CloudKitClientConfig } from '../cloudkit-client.js';

function createProviderForContract() {
  const { client } = createCloudKitApiMock();
  const config: CloudKitClientConfig = {
    containerIdentifier: 'com.test.contract',
    environment: 'development',
  };
  return new ICloudProvider({ client, config });
}

describeProviderContract('ICloudProvider', createProviderForContract);
```

- [ ] **Step 3: Run all tests**

Run: `cd packages/provider-icloud && pnpm test`
Expected: All tests PASS, including full contract suite

- [ ] **Step 4: Run typecheck**

Run: `cd packages/provider-icloud && pnpm typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/provider-icloud/src/index.ts packages/provider-icloud/src/__tests__/icloud-provider-contract.test.ts
git commit -m "feat(icloud): add barrel export and provider contract tests"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run full build**

Run: `cd packages/provider-icloud && pnpm build`
Expected: Build succeeds, `dist/` populated

- [ ] **Step 2: Run all tests one final time**

Run: `cd packages/provider-icloud && pnpm test`
Expected: All tests PASS

- [ ] **Step 3: Run lint**

Run: `cd packages/provider-icloud && pnpm lint`
Expected: No errors (or only pre-existing warnings)

- [ ] **Step 4: Verify contract test count**

Run: `cd packages/provider-icloud && pnpm test -- --reporter=verbose`
Expected: Contract tests show lifecycle, put/get, list, delete, revision, and conflict sections all passing