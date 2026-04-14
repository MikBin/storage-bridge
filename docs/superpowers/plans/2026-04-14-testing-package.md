# Testing Package and Provider Contract Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `packages/testing` with reusable test fixtures, an in-memory fake provider, and an exported conformance test suite that validates any `DocumentStoreProvider` implementation.

**Architecture:** Three modules in a new `packages/testing` package. `fixtures.ts` provides factory functions for test data. `fake-provider.ts` implements a full in-memory `DocumentStoreProvider`. `provider-contract-tests.ts` exports a `describeProviderContract(name, factory)` function that runs a Vitest `describe` block validating the provider contract.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo, `@storage-bridge/core`

**Spec:** `docs/superpowers/specs/2026-04-14-testing-package-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/testing/package.json` | Create | Package manifest with `@storage-bridge/core` dependency |
| `packages/testing/tsconfig.json` | Create | TypeScript config extending shared base |
| `packages/testing/vitest.config.ts` | Create | Vitest config matching core package pattern |
| `packages/testing/src/types.ts` | Create | `ProviderFactory` type alias |
| `packages/testing/src/fixtures.ts` | Create | `createSettingsEnvelope`, `createSettingsSummary`, `createConnectedProfile` factory functions |
| `packages/testing/src/fake-provider.ts` | Create | `FakeDocumentStoreProvider` — full in-memory implementation |
| `packages/testing/src/provider-contract-tests.ts` | Create | `describeProviderContract(name, factory)` — exported conformance suite |
| `packages/testing/src/index.ts` | Create | Barrel re-export |
| `packages/testing/src/__tests__/fixtures.test.ts` | Create | Fixture factory tests |
| `packages/testing/src/__tests__/fake-provider.test.ts` | Create | Fake provider behavior tests |
| `packages/testing/src/__tests__/provider-contract-tests.test.ts` | Create | Meta-test: contract suite runs against fake provider |

---

### Task 1: Package Scaffold

**Files:**
- Create: `packages/testing/package.json`
- Create: `packages/testing/tsconfig.json`
- Create: `packages/testing/vitest.config.ts`

- [ ] **Step 1: Create `packages/testing/package.json`**

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

- [ ] **Step 2: Create `packages/testing/tsconfig.json`**

```json
{
  "extends": "@storage-bridge/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/testing/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `cd packages/testing && pnpm install`
Expected: Dependencies linked successfully

- [ ] **Step 5: Commit**

```bash
git add packages/testing/package.json packages/testing/tsconfig.json packages/testing/vitest.config.ts
git commit -m "chore(testing): scaffold @storage-bridge/testing package"
```

---

### Task 2: Fixtures — Failing Tests

**Files:**
- Create: `packages/testing/src/__tests__/fixtures.test.ts`

- [ ] **Step 6: Write the failing fixture tests**

```ts
import { describe, it, expect } from 'vitest';
import { createSettingsEnvelope, createSettingsSummary, createConnectedProfile } from '../fixtures.js';

describe('createSettingsEnvelope', () => {
  it('returns an envelope with default values', () => {
    const env = createSettingsEnvelope<{ name: string }>();
    expect(env.key).toBe('test-key');
    expect(env.schemaVersion).toBe(1);
    expect(env.updatedAt).toBeDefined();
    expect(typeof env.updatedAt).toBe('string');
    expect(env.data).toEqual({});
    expect(env.revision).toBeUndefined();
  });

  it('applies partial overrides', () => {
    const env = createSettingsEnvelope({ key: 'custom-key', schemaVersion: 3 });
    expect(env.key).toBe('custom-key');
    expect(env.schemaVersion).toBe(3);
    expect(env.data).toEqual({});
  });

  it('allows data override', () => {
    const env = createSettingsEnvelope({ data: { name: 'Alice' } });
    expect(env.data).toEqual({ name: 'Alice' });
  });

  it('sets updatedAt to a recent ISO string', () => {
    const before = new Date(Date.now() - 1000).toISOString();
    const env = createSettingsEnvelope();
    const after = new Date(Date.now() + 1000).toISOString();
    expect(env.updatedAt >= before).toBe(true);
    expect(env.updatedAt <= after).toBe(true);
  });
});

describe('createSettingsSummary', () => {
  it('returns a summary with default values', () => {
    const sum = createSettingsSummary();
    expect(sum.key).toBe('test-key');
    expect(sum.updatedAt).toBeDefined();
    expect(sum.revision).toBeUndefined();
  });

  it('applies partial overrides', () => {
    const sum = createSettingsSummary({ key: 'other', revision: 'rev-1' });
    expect(sum.key).toBe('other');
    expect(sum.revision).toBe('rev-1');
  });
});

describe('createConnectedProfile', () => {
  it('returns a profile with default values', () => {
    const prof = createConnectedProfile();
    expect(prof.provider).toBe('local');
    expect(prof.accountId).toBeUndefined();
    expect(prof.email).toBeUndefined();
    expect(prof.displayName).toBeUndefined();
  });

  it('applies partial overrides', () => {
    const prof = createConnectedProfile({
      provider: 'google-drive',
      email: 'user@example.com',
    });
    expect(prof.provider).toBe('google-drive');
    expect(prof.email).toBe('user@example.com');
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd packages/testing && npx vitest run src/__tests__/fixtures.test.ts`
Expected: FAIL — module `../fixtures.js` not found

---

### Task 3: Fixtures — Implementation

**Files:**
- Create: `packages/testing/src/fixtures.ts`

- [ ] **Step 8: Write the fixtures implementation**

```ts
import type { SettingsEnvelope, SettingsSummary, ConnectedProfile } from '@storage-bridge/core';

/**
 * Create a SettingsEnvelope with sensible defaults and optional overrides.
 * Default: key='test-key', schemaVersion=1, updatedAt=now, data={}, no revision
 */
export function createSettingsEnvelope<T = Record<string, unknown>>(
  overrides: Partial<SettingsEnvelope<T>> = {},
): SettingsEnvelope<T> {
  return {
    key: 'test-key',
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    data: {} as T,
    ...overrides,
  };
}

/**
 * Create a SettingsSummary with sensible defaults and optional overrides.
 * Default: key='test-key', updatedAt=now, no revision
 */
export function createSettingsSummary(
  overrides: Partial<SettingsSummary> = {},
): SettingsSummary {
  return {
    key: 'test-key',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a ConnectedProfile with sensible defaults and optional overrides.
 * Default: provider='local', no accountId/email/displayName
 */
export function createConnectedProfile(
  overrides: Partial<ConnectedProfile> = {},
): ConnectedProfile {
  return {
    provider: 'local',
    ...overrides,
  };
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd packages/testing && npx vitest run src/__tests__/fixtures.test.ts`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add packages/testing/src/fixtures.ts packages/testing/src/__tests__/fixtures.test.ts
git commit -m "feat(testing): add test fixture factory functions with tests"
```

---

### Task 4: FakeDocumentStoreProvider — Failing Tests

**Files:**
- Create: `packages/testing/src/__tests__/fake-provider.test.ts`

- [ ] **Step 11: Write the failing fake provider tests**

```ts
import { describe, it, expect } from 'vitest';
import { FakeDocumentStoreProvider } from '../fake-provider.js';

function createProvider(): FakeDocumentStoreProvider {
  return new FakeDocumentStoreProvider();
}

describe('FakeDocumentStoreProvider', () => {
  describe('connect/disconnect lifecycle', () => {
    it('starts disconnected', async () => {
      const p = createProvider();
      expect(await p.isConnected()).toBe(false);
    });

    it('connect() transitions to connected', async () => {
      const p = createProvider();
      await p.connect();
      expect(await p.isConnected()).toBe(true);
    });

    it('disconnect() transitions to disconnected', async () => {
      const p = createProvider();
      await p.connect();
      await p.disconnect();
      expect(await p.isConnected()).toBe(false);
    });

    it('getProfile() returns null when disconnected', async () => {
      const p = createProvider();
      expect(await p.getProfile()).toBeNull();
    });

    it('getProfile() returns profile when connected', async () => {
      const p = createProvider();
      await p.connect();
      const profile = await p.getProfile();
      expect(profile).not.toBeNull();
      expect(profile!.provider).toBe('local');
    });
  });

  describe('putDocument + getDocument', () => {
    it('returns null for non-existent key', async () => {
      const p = createProvider();
      const result = await p.getDocument<{ x: number }>('missing');
      expect(result).toBeNull();
    });

    it('creates and retrieves a document', async () => {
      const p = createProvider();
      const doc = await p.putDocument<{ x: number }>({
        key: 'test',
        schemaVersion: 1,
        updatedAt: '',
        data: { x: 42 },
      });
      expect(doc.key).toBe('test');
      expect(doc.data).toEqual({ x: 42 });
      expect(doc.revision).toBe('rev-1');

      const retrieved = await p.getDocument<{ x: number }>('test');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.data).toEqual({ x: 42 });
    });

    it('overwrites an existing key and increments revision', async () => {
      const p = createProvider();
      await p.putDocument({ key: 'cfg', schemaVersion: 1, updatedAt: '', data: { v: 1 } });
      const updated = await p.putDocument({ key: 'cfg', schemaVersion: 1, updatedAt: '', data: { v: 2 } });
      expect(updated.data).toEqual({ v: 2 });
      expect(updated.revision).toBe('rev-2');
    });

    it('multiple keys coexist independently', async () => {
      const p = createProvider();
      await p.putDocument({ key: 'a', schemaVersion: 1, updatedAt: '', data: { val: 1 } });
      await p.putDocument({ key: 'b', schemaVersion: 1, updatedAt: '', data: { val: 2 } });
      const a = await p.getDocument<{ val: number }>('a');
      const b = await p.getDocument<{ val: number }>('b');
      expect(a!.data.val).toBe(1);
      expect(b!.data.val).toBe(2);
    });
  });

  describe('deleteDocument', () => {
    it('removes a document', async () => {
      const p = createProvider();
      await p.putDocument({ key: 'del-me', schemaVersion: 1, updatedAt: '', data: {} });
      await p.deleteDocument('del-me');
      expect(await p.getDocument('del-me')).toBeNull();
    });

    it('does not throw for non-existent key', async () => {
      const p = createProvider();
      await expect(p.deleteDocument('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('listDocuments', () => {
    it('returns empty array when nothing stored', async () => {
      const p = createProvider();
      expect(await p.listDocuments()).toEqual([]);
    });

    it('returns summaries for all stored documents', async () => {
      const p = createProvider();
      await p.putDocument({ key: 'a', schemaVersion: 1, updatedAt: '', data: {} });
      await p.putDocument({ key: 'b', schemaVersion: 1, updatedAt: '', data: {} });
      const list = await p.listDocuments();
      expect(list).toHaveLength(2);
      const keys = list.map(s => s.key).sort();
      expect(keys).toEqual(['a', 'b']);
      for (const s of list) {
        expect(s.updatedAt).toBeDefined();
        expect(s.revision).toBeDefined();
      }
    });
  });

  describe('revision tracking', () => {
    it('first putDocument produces a revision', async () => {
      const p = createProvider();
      const doc = await p.putDocument({ key: 'rev', schemaVersion: 1, updatedAt: '', data: {} });
      expect(doc.revision).toBe('rev-1');
    });

    it('subsequent putDocument produces a different revision', async () => {
      const p = createProvider();
      const first = await p.putDocument({ key: 'rev', schemaVersion: 1, updatedAt: '', data: {} });
      const second = await p.putDocument({ key: 'rev', schemaVersion: 1, updatedAt: '', data: {} });
      expect(first.revision).not.toBe(second.revision);
    });

    it('revision is stable on read', async () => {
      const p = createProvider();
      await p.putDocument({ key: 'stable', schemaVersion: 1, updatedAt: '', data: {} });
      const r1 = await p.getDocument('stable');
      const r2 = await p.getDocument('stable');
      expect(r1!.revision).toBe(r2!.revision);
    });
  });

  describe('expectedRevision (conflict detection)', () => {
    it('putDocument with matching expectedRevision succeeds', async () => {
      const p = createProvider();
      const doc = await p.putDocument({ key: 'conflict', schemaVersion: 1, updatedAt: '', data: {} });
      const updated = await p.putDocument(
        { key: 'conflict', schemaVersion: 1, updatedAt: '', data: { v: 2 } },
        { expectedRevision: doc.revision },
      );
      expect(updated.data).toEqual({ v: 2 });
    });

    it('putDocument with stale expectedRevision throws ConflictError', async () => {
      const p = createProvider();
      await p.putDocument({ key: 'conflict', schemaVersion: 1, updatedAt: '', data: {} });
      // stale revision
      await expect(
        p.putDocument(
          { key: 'conflict', schemaVersion: 1, updatedAt: '', data: {} },
          { expectedRevision: 'rev-0' },
        ),
      ).rejects.toThrow();
    });

    it('putDocument without expectedRevision always succeeds', async () => {
      const p = createProvider();
      await p.putDocument({ key: 'free', schemaVersion: 1, updatedAt: '', data: {} });
      await expect(
        p.putDocument({ key: 'free', schemaVersion: 1, updatedAt: '', data: { v: 2 } }),
      ).resolves.toBeDefined();
    });
  });
});
```

- [ ] **Step 12: Run tests to verify they fail**

Run: `cd packages/testing && npx vitest run src/__tests__/fake-provider.test.ts`
Expected: FAIL — module `../fake-provider.js` not found

---

### Task 5: FakeDocumentStoreProvider — Implementation

**Files:**
- Create: `packages/testing/src/fake-provider.ts`

- [ ] **Step 13: Write the FakeDocumentStoreProvider implementation**

```ts
import type {
  DocumentStoreProvider,
  ProviderId,
  SettingsEnvelope,
  SettingsSummary,
  ConnectedProfile,
  PutOptions,
} from '@storage-bridge/core';
import { ConflictError } from '@storage-bridge/core';

/**
 * In-memory DocumentStoreProvider for testing.
 * Supports revision tracking and conflict detection via expectedRevision.
 */
export class FakeDocumentStoreProvider implements DocumentStoreProvider {
  readonly id: ProviderId = 'local';
  private store = new Map<string, SettingsEnvelope<unknown>>();
  private revCounters = new Map<string, number>();
  private connected = false;
  private profile: ConnectedProfile | null = null;

  async connect(): Promise<void> {
    this.connected = true;
    this.profile = { provider: this.id };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.profile = null;
  }

  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  async getProfile(): Promise<ConnectedProfile | null> {
    return this.profile;
  }

  async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    return entry as SettingsEnvelope<T>;
  }

  async putDocument<T>(doc: SettingsEnvelope<T>, options?: PutOptions): Promise<SettingsEnvelope<T>> {
    const existing = this.store.get(doc.key);

    if (options?.expectedRevision !== undefined) {
      const currentRev = existing?.revision;
      if (currentRev !== options.expectedRevision) {
        throw new ConflictError(doc.key);
      }
    }

    const counter = (this.revCounters.get(doc.key) ?? 0) + 1;
    this.revCounters.set(doc.key, counter);

    const envelope: SettingsEnvelope<T> = {
      key: doc.key,
      schemaVersion: doc.schemaVersion,
      updatedAt: doc.updatedAt || new Date().toISOString(),
      revision: `rev-${counter}`,
      data: doc.data,
    };

    this.store.set(doc.key, envelope as SettingsEnvelope<unknown>);
    return envelope;
  }

  async deleteDocument(key: string): Promise<void> {
    this.store.delete(key);
  }

  async listDocuments(): Promise<SettingsSummary[]> {
    return Array.from(this.store.values()).map(entry => ({
      key: entry.key,
      updatedAt: entry.updatedAt,
      revision: entry.revision,
    }));
  }
}
```

- [ ] **Step 14: Run tests to verify they pass**

Run: `cd packages/testing && npx vitest run src/__tests__/fake-provider.test.ts`
Expected: ALL PASS

- [ ] **Step 15: Commit**

```bash
git add packages/testing/src/fake-provider.ts packages/testing/src/__tests__/fake-provider.test.ts
git commit -m "feat(testing): add FakeDocumentStoreProvider with tests"
```

---

### Task 6: Provider Contract Tests — Failing Meta-Test

**Files:**
- Create: `packages/testing/src/types.ts`
- Create: `packages/testing/src/__tests__/provider-contract-tests.test.ts`

- [ ] **Step 16: Create `packages/testing/src/types.ts` with ProviderFactory type**

```ts
import type { DocumentStoreProvider } from '@storage-bridge/core';

/**
 * Factory function that creates a fresh DocumentStoreProvider for each test.
 * Matches the ProviderDescriptor.create() pattern from the registry.
 */
export type ProviderFactory = () => DocumentStoreProvider;
```

- [ ] **Step 17: Write the meta-test that validates the contract suite against the fake provider**

```ts
import { describe, it, expect } from 'vitest';
import { describeProviderContract } from '../provider-contract-tests.js';
import { FakeDocumentStoreProvider } from '../fake-provider.js';

// Run the contract suite against the fake provider to verify the suite itself works
describeProviderContract('FakeDocumentStoreProvider', () => new FakeDocumentStoreProvider());

// Additional meta-test: verify the suite actually runs tests
describe('describeProviderContract meta-tests', () => {
  it('is exported as a function', () => {
    expect(typeof describeProviderContract).toBe('function');
  });
});
```

- [ ] **Step 18: Run tests to verify they fail**

Run: `cd packages/testing && npx vitest run src/__tests__/provider-contract-tests.test.ts`
Expected: FAIL — module `../provider-contract-tests.js` not found

---

### Task 7: Provider Contract Tests — Implementation

**Files:**
- Create: `packages/testing/src/provider-contract-tests.ts`

- [ ] **Step 19: Write the provider conformance test suite**

```ts
import { describe, it, expect } from 'vitest';
import type { DocumentStoreProvider } from '@storage-bridge/core';
import { ConflictError } from '@storage-bridge/core';
import type { ProviderFactory } from './types.js';

/**
 * Run the standard conformance test suite against a DocumentStoreProvider.
 *
 * @param name - Provider name for test output (e.g., "FakeDocumentStoreProvider")
 * @param factory - Factory that creates a fresh provider instance per test group
 */
export function describeProviderContract(
  name: string,
  factory: ProviderFactory,
): void {
  describe(`${name} — Provider Contract`, () => {
    describe('Connect/Disconnect Lifecycle', () => {
      it('starts disconnected', async () => {
        const provider = factory();
        expect(await provider.isConnected()).toBe(false);
      });

      it('connect() transitions to connected', async () => {
        const provider = factory();
        await provider.connect();
        expect(await provider.isConnected()).toBe(true);
      });

      it('disconnect() transitions back to disconnected', async () => {
        const provider = factory();
        await provider.connect();
        await provider.disconnect();
        expect(await provider.isConnected()).toBe(false);
      });

      it('disconnect() when already disconnected does not throw', async () => {
        const provider = factory();
        await expect(provider.disconnect()).resolves.toBeUndefined();
      });

      it('getProfile() returns null when disconnected', async () => {
        const provider = factory();
        expect(await provider.getProfile()).toBeNull();
      });

      it('getProfile() returns profile when connected', async () => {
        const provider = factory();
        await provider.connect();
        const profile = await provider.getProfile();
        expect(profile).not.toBeNull();
        expect(profile!.provider).toBeDefined();
      });
    });

    describe('Put/Get Round-trip', () => {
      it('getDocument() returns null for non-existent key', async () => {
        const provider = factory();
        const result = await provider.getDocument<{ x: number }>('nonexistent');
        expect(result).toBeNull();
      });

      it('putDocument() then getDocument() returns the same data', async () => {
        const provider = factory();
        const doc = await provider.putDocument<{ x: number }>({
          key: 'round-trip',
          schemaVersion: 1,
          updatedAt: '',
          data: { x: 42 },
        });
        const retrieved = await provider.getDocument<{ x: number }>('round-trip');
        expect(retrieved).not.toBeNull();
        expect(retrieved!.data).toEqual({ x: 42 });
      });

      it('putDocument() returns an envelope with the provided key and data', async () => {
        const provider = factory();
        const doc = await provider.putDocument<{ val: string }>({
          key: 'my-key',
          schemaVersion: 1,
          updatedAt: '',
          data: { val: 'hello' },
        });
        expect(doc.key).toBe('my-key');
        expect(doc.data).toEqual({ val: 'hello' });
      });

      it('multiple keys can coexist independently', async () => {
        const provider = factory();
        await provider.putDocument({ key: 'key-a', schemaVersion: 1, updatedAt: '', data: { a: 1 } });
        await provider.putDocument({ key: 'key-b', schemaVersion: 1, updatedAt: '', data: { b: 2 } });
        const a = await provider.getDocument<{ a: number }>('key-a');
        const b = await provider.getDocument<{ b: number }>('key-b');
        expect(a!.data).toEqual({ a: 1 });
        expect(b!.data).toEqual({ b: 2 });
      });

      it('overwriting an existing key updates its data', async () => {
        const provider = factory();
        await provider.putDocument<{ v: number }>({ key: 'overwrite', schemaVersion: 1, updatedAt: '', data: { v: 1 } });
        await provider.putDocument<{ v: number }>({ key: 'overwrite', schemaVersion: 1, updatedAt: '', data: { v: 2 } });
        const retrieved = await provider.getDocument<{ v: number }>('overwrite');
        expect(retrieved!.data).toEqual({ v: 2 });
      });
    });

    describe('List Documents', () => {
      it('listDocuments() returns empty array when no documents exist', async () => {
        const provider = factory();
        expect(await provider.listDocuments()).toEqual([]);
      });

      it('listDocuments() returns summaries for all stored documents', async () => {
        const provider = factory();
        await provider.putDocument({ key: 'list-a', schemaVersion: 1, updatedAt: '', data: {} });
        await provider.putDocument({ key: 'list-b', schemaVersion: 1, updatedAt: '', data: {} });
        const list = await provider.listDocuments();
        expect(list).toHaveLength(2);
        const keys = list.map(s => s.key).sort();
        expect(keys).toEqual(['list-a', 'list-b']);
      });

      it('listDocuments() reflects documents added via putDocument()', async () => {
        const provider = factory();
        expect(await provider.listDocuments()).toEqual([]);
        await provider.putDocument({ key: 'added', schemaVersion: 1, updatedAt: '', data: {} });
        const list = await provider.listDocuments();
        expect(list).toHaveLength(1);
        expect(list[0].key).toBe('added');
      });

      it('listDocuments() reflects documents removed via deleteDocument()', async () => {
        const provider = factory();
        await provider.putDocument({ key: 'to-remove', schemaVersion: 1, updatedAt: '', data: {} });
        await provider.deleteDocument('to-remove');
        const list = await provider.listDocuments();
        expect(list).toEqual([]);
      });
    });

    describe('Delete', () => {
      it('deleteDocument() removes a document so subsequent getDocument() returns null', async () => {
        const provider = factory();
        await provider.putDocument({ key: 'del', schemaVersion: 1, updatedAt: '', data: {} });
        await provider.deleteDocument('del');
        expect(await provider.getDocument('del')).toBeNull();
      });

      it('deleteDocument() does not throw for non-existent keys', async () => {
        const provider = factory();
        await expect(provider.deleteDocument('never-existed')).resolves.toBeUndefined();
      });

      it('deleting one document does not affect others', async () => {
        const provider = factory();
        await provider.putDocument({ key: 'keep', schemaVersion: 1, updatedAt: '', data: { keep: true } });
        await provider.putDocument({ key: 'remove', schemaVersion: 1, updatedAt: '', data: { remove: true } });
        await provider.deleteDocument('remove');
        expect(await provider.getDocument('keep')).not.toBeNull();
        expect(await provider.getDocument('remove')).toBeNull();
      });
    });

    describe('Revision Updates', () => {
      it('first putDocument() produces an envelope with a revision', async () => {
        const provider = factory();
        const doc = await provider.putDocument({ key: 'rev', schemaVersion: 1, updatedAt: '', data: {} });
        expect(doc.revision).toBeDefined();
        expect(typeof doc.revision).toBe('string');
      });

      it('subsequent putDocument() for the same key produces a different revision', async () => {
        const provider = factory();
        const first = await provider.putDocument({ key: 'rev-change', schemaVersion: 1, updatedAt: '', data: {} });
        const second = await provider.putDocument({ key: 'rev-change', schemaVersion: 1, updatedAt: '', data: {} });
        expect(first.revision).not.toBe(second.revision);
      });

      it('revision is stable — reading the same document twice returns the same revision', async () => {
        const provider = factory();
        await provider.putDocument({ key: 'stable-rev', schemaVersion: 1, updatedAt: '', data: {} });
        const r1 = await provider.getDocument('stable-rev');
        const r2 = await provider.getDocument('stable-rev');
        expect(r1!.revision).toBe(r2!.revision);
      });

      it('revision is reflected in listDocuments() summaries', async () => {
        const provider = factory();
        const doc = await provider.putDocument({ key: 'list-rev', schemaVersion: 1, updatedAt: '', data: {} });
        const list = await provider.listDocuments();
        const found = list.find(s => s.key === 'list-rev');
        expect(found).toBeDefined();
        expect(found!.revision).toBe(doc.revision);
      });
    });

    describe('Conflict/Optimistic Concurrency (expectedRevision)', () => {
      it('putDocument() with a matching expectedRevision succeeds', async () => {
        const provider = factory();
        const doc = await provider.putDocument({ key: 'conflict', schemaVersion: 1, updatedAt: '', data: {} });
        const updated = await provider.putDocument(
          { key: 'conflict', schemaVersion: 1, updatedAt: '', data: { v: 2 } },
          { expectedRevision: doc.revision },
        );
        expect(updated.data).toEqual({ v: 2 });
      });

      it('putDocument() with a stale expectedRevision throws ConflictError', async () => {
        const provider = factory();
        await provider.putDocument({ key: 'stale', schemaVersion: 1, updatedAt: '', data: {} });
        await expect(
          provider.putDocument(
            { key: 'stale', schemaVersion: 1, updatedAt: '', data: {} },
            { expectedRevision: 'stale-revision-that-does-not-match' },
          ),
        ).rejects.toThrow(ConflictError);
      });

      it('putDocument() without expectedRevision always succeeds', async () => {
        const provider = factory();
        await provider.putDocument({ key: 'free', schemaVersion: 1, updatedAt: '', data: {} });
        const updated = await provider.putDocument(
          { key: 'free', schemaVersion: 1, updatedAt: '', data: { v: 2 } },
        );
        expect(updated.data).toEqual({ v: 2 });
      });
    });
  });
}
```

- [ ] **Step 20: Run tests to verify they pass**

Run: `cd packages/testing && npx vitest run src/__tests__/provider-contract-tests.test.ts`
Expected: ALL PASS (contract suite runs against FakeDocumentStoreProvider)

- [ ] **Step 21: Commit**

```bash
git add packages/testing/src/provider-contract-tests.ts packages/testing/src/types.ts packages/testing/src/__tests__/provider-contract-tests.test.ts
git commit -m "feat(testing): add provider contract conformance test suite"
```

---

### Task 8: Barrel Export and Final Verification

**Files:**
- Create: `packages/testing/src/index.ts`

- [ ] **Step 22: Create the barrel export**

```ts
export * from './types.js';
export * from './fixtures.js';
export * from './fake-provider.js';
export * from './provider-contract-tests.js';
```

- [ ] **Step 23: Run full test suite**

Run: `cd packages/testing && npx vitest run`
Expected: ALL PASS

- [ ] **Step 24: Run typecheck**

Run: `cd packages/testing && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 25: Commit**

```bash
git add packages/testing/src/index.ts
git commit -m "feat(testing): add barrel export for @storage-bridge/testing"