# Provider Port and Base Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `FileBackedDocumentProvider` and `RecordBackedDocumentProvider` abstract base classes with full test coverage using in-memory stubs.

**Architecture:** Two abstract classes in `packages/core/src/providers/` implement the `DocumentStoreProvider` interface from TASK-2. Each class translates between the document-oriented public API and a small set of primitive operations that concrete providers implement. Tests use in-memory stubs.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo

**Spec:** `docs/superpowers/specs/2026-04-14-provider-port-base-adapters-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/core/src/providers/file-backed-document-provider.ts` | Create | `FileEntry` interface + `FileBackedDocumentProvider` abstract class |
| `packages/core/src/providers/record-backed-document-provider.ts` | Create | `CloudRecord` interface + `RecordBackedDocumentProvider` abstract class |
| `packages/core/src/__tests__/file-backed-document-provider.test.ts` | Create | Tests with `InMemoryFileProvider` stub |
| `packages/core/src/__tests__/record-backed-document-provider.test.ts` | Create | Tests with `InMemoryRecordProvider` stub |
| `packages/core/src/index.ts` | Modify | Add re-exports for both provider modules |

---

### Task 1: FileBackedDocumentProvider — Failing Tests

**Files:**
- Create: `packages/core/src/__tests__/file-backed-document-provider.test.ts`

- [ ] **Step 1: Write the failing test file with InMemoryFileProvider stub and key-to-filename tests**

```ts
import { describe, it, expect } from 'vitest';
import type { FileEntry } from '../providers/file-backed-document-provider.js';
import { FileBackedDocumentProvider } from '../providers/file-backed-document-provider.js';
import type { ProviderId, PutOptions, SettingsEnvelope, SettingsSummary, ConnectedProfile } from '../types.js';

class InMemoryFileProvider extends FileBackedDocumentProvider {
  readonly id: ProviderId = 'local';
  private store = new Map<string, { body: string; meta: FileEntry }>();
  private revCounter = 0;

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async isConnected(): Promise<boolean> { return true; }
  async getProfile(): Promise<ConnectedProfile | null> { return { provider: this.id }; }

  protected async readFile(fileName: string): Promise<{ text: string; meta: FileEntry } | null> {
    const entry = this.store.get(fileName);
    return entry ?? null;
  }

  protected async writeFile(fileName: string, body: string, _options?: PutOptions): Promise<FileEntry> {
    const existing = this.store.get(fileName);
    this.revCounter++;
    const meta: FileEntry = {
      id: `${fileName}-${this.revCounter}`,
      logicalKey: this.fileNameToKey(fileName),
      name: fileName,
      updatedAt: new Date().toISOString(),
      revision: `rev-${this.revCounter}`,
      size: body.length,
    };
    this.store.set(fileName, { body, meta });
    return meta;
  }

  protected async removeFile(fileName: string): Promise<void> {
    this.store.delete(fileName);
  }

  protected async listFiles(): Promise<FileEntry[]> {
    return Array.from(this.store.values()).map(e => e.meta);
  }
}

function createProvider(): InMemoryFileProvider {
  return new InMemoryFileProvider();
}

describe('FileBackedDocumentProvider', () => {
  describe('keyToFileName / fileNameToKey', () => {
    it('encodes key with .json suffix', () => {
      const p = createProvider();
      expect(p['keyToFileName']('settings')).toBe('settings.json');
    });

    it('handles special characters', () => {
      const p = createProvider();
      expect(p['keyToFileName']('user/preferências')).toBe('user%2Fprefer%C3%AAncias.json');
    });

    it('reverses keyToFileName', () => {
      const p = createProvider();
      const key = 'user/settings';
      expect(p['fileNameToKey'](p['keyToFileName'](key))).toBe(key);
    });
  });

  describe('getDocument', () => {
    it('returns null for missing key', async () => {
      const p = createProvider();
      const result = await p.getDocument<{ x: number }>('missing');
      expect(result).toBeNull();
    });
  });

  describe('putDocument + getDocument', () => {
    it('creates and retrieves a document', async () => {
      const p = createProvider();
      const doc = await p.putDocument<{ x: number }>(
        { key: 'test', schemaVersion: 1, updatedAt: '', data: { x: 42 } },
      );
      expect(doc.key).toBe('test');
      expect(doc.data).toEqual({ x: 42 });
      expect(doc.revision).toBeDefined();

      const retrieved = await p.getDocument<{ x: number }>('test');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.data).toEqual({ x: 42 });
    });

    it('updates an existing document', async () => {
      const p = createProvider();
      await p.putDocument<{ v: number }>({ key: 'cfg', schemaVersion: 1, updatedAt: '', data: { v: 1 } });
      const updated = await p.putDocument<{ v: number }>({ key: 'cfg', schemaVersion: 1, updatedAt: '', data: { v: 2 } });
      expect(updated.data).toEqual({ v: 2 });

      const retrieved = await p.getDocument<{ v: number }>('cfg');
      expect(retrieved!.data).toEqual({ v: 2 });
    });

    it('propagates revision from file metadata', async () => {
      const p = createProvider();
      const doc = await p.putDocument<{ x: number }>({ key: 'rev-test', schemaVersion: 1, updatedAt: '', data: { x: 1 } });
      expect(doc.revision).toBe('rev-1');
    });
  });

  describe('deleteDocument', () => {
    it('removes a document', async () => {
      const p = createProvider();
      await p.putDocument<{ x: number }>({ key: 'del-me', schemaVersion: 1, updatedAt: '', data: { x: 1 } });
      await p.deleteDocument('del-me');
      const result = await p.getDocument<{ x: number }>('del-me');
      expect(result).toBeNull();
    });

    it('is a no-op for missing key', async () => {
      const p = createProvider();
      await expect(p.deleteDocument('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('listDocuments', () => {
    it('returns empty array when nothing stored', async () => {
      const p = createProvider();
      const list = await p.listDocuments();
      expect(list).toEqual([]);
    });

    it('returns all stored documents as summaries', async () => {
      const p = createProvider();
      await p.putDocument<{ a: number }>({ key: 'a', schemaVersion: 1, updatedAt: '', data: { a: 1 } });
      await p.putDocument<{ b: number }>({ key: 'b', schemaVersion: 1, updatedAt: '', data: { b: 2 } });
      const list = await p.listDocuments();
      expect(list).toHaveLength(2);
      const keys = list.map(s => s.key).sort();
      expect(keys).toEqual(['a', 'b']);
      for (const s of list) {
        expect(s.updatedAt).toBeDefined();
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/__tests__/file-backed-document-provider.test.ts`
Expected: FAIL — module `../providers/file-backed-document-provider.js` not found

---

### Task 2: FileBackedDocumentProvider — Implementation

**Files:**
- Create: `packages/core/src/providers/file-backed-document-provider.ts`

- [ ] **Step 3: Write the FileBackedDocumentProvider implementation**

```ts
import type {
  DocumentStoreProvider,
  ProviderId,
  PutOptions,
  SettingsEnvelope,
  SettingsSummary,
  ConnectedProfile,
} from '../types.js';

export interface FileEntry {
  id: string;
  logicalKey: string;
  name: string;
  updatedAt?: string;
  revision?: string;
  size?: number;
}

export abstract class FileBackedDocumentProvider implements DocumentStoreProvider {
  abstract readonly id: ProviderId;

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): Promise<boolean>;
  abstract getProfile(): Promise<ConnectedProfile | null>;

  protected abstract readFile(fileName: string): Promise<{ text: string; meta: FileEntry } | null>;
  protected abstract writeFile(fileName: string, body: string, options?: PutOptions): Promise<FileEntry>;
  protected abstract removeFile(fileName: string): Promise<void>;
  protected abstract listFiles(): Promise<FileEntry[]>;

  protected keyToFileName(key: string): string {
    return `${encodeURIComponent(key)}.json`;
  }

  protected fileNameToKey(fileName: string): string {
    return decodeURIComponent(fileName.replace(/\.json$/, ''));
  }

  async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    const file = await this.readFile(this.keyToFileName(key));
    if (!file) return null;
    const parsed = JSON.parse(file.text) as SettingsEnvelope<T>;
    return { ...parsed, key, revision: file.meta.revision ?? parsed.revision };
  }

  async putDocument<T>(doc: SettingsEnvelope<T>, options?: PutOptions): Promise<SettingsEnvelope<T>> {
    const payload = JSON.stringify({ ...doc, updatedAt: new Date().toISOString() });
    const meta = await this.writeFile(this.keyToFileName(doc.key), payload, options);
    return { ...doc, updatedAt: meta.updatedAt ?? doc.updatedAt, revision: meta.revision };
  }

  async deleteDocument(key: string): Promise<void> {
    await this.removeFile(this.keyToFileName(key));
  }

  async listDocuments(): Promise<SettingsSummary[]> {
    const files = await this.listFiles();
    return files.map(f => ({
      key: f.logicalKey,
      updatedAt: f.updatedAt ?? new Date(0).toISOString(),
      revision: f.revision,
    }));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/__tests__/file-backed-document-provider.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/providers/file-backed-document-provider.ts packages/core/src/__tests__/file-backed-document-provider.test.ts
git commit -m "feat(core): add FileBackedDocumentProvider abstract class with tests"
```

---

### Task 3: RecordBackedDocumentProvider — Failing Tests

**Files:**
- Create: `packages/core/src/__tests__/record-backed-document-provider.test.ts`

- [ ] **Step 6: Write the failing test file with InMemoryRecordProvider stub**

```ts
import { describe, it, expect } from 'vitest';
import type { CloudRecord } from '../providers/record-backed-document-provider.js';
import { RecordBackedDocumentProvider } from '../providers/record-backed-document-provider.js';
import type { ProviderId, PutOptions, ConnectedProfile } from '../types.js';

class InMemoryRecordProvider extends RecordBackedDocumentProvider {
  readonly id: ProviderId = 'icloud';
  private store = new Map<string, CloudRecord>();
  private tagCounter = 0;

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async isConnected(): Promise<boolean> { return true; }
  async getProfile(): Promise<ConnectedProfile | null> { return { provider: this.id }; }

  protected async getRecord(key: string): Promise<CloudRecord | null> {
    return this.store.get(key) ?? null;
  }

  protected async saveRecord(record: CloudRecord, _options?: PutOptions): Promise<CloudRecord> {
    this.tagCounter++;
    const saved: CloudRecord = {
      recordName: record.recordName,
      modifiedAt: new Date().toISOString(),
      changeTag: `tag-${this.tagCounter}`,
      fields: { ...record.fields },
    };
    this.store.set(record.recordName, saved);
    return saved;
  }

  protected async removeRecord(key: string): Promise<void> {
    this.store.delete(key);
  }

  protected async listRecords(): Promise<CloudRecord[]> {
    return Array.from(this.store.values());
  }
}

function createProvider(): InMemoryRecordProvider {
  return new InMemoryRecordProvider();
}

describe('RecordBackedDocumentProvider', () => {
  describe('getDocument', () => {
    it('returns null for missing key', async () => {
      const p = createProvider();
      const result = await p.getDocument<{ x: number }>('missing');
      expect(result).toBeNull();
    });
  });

  describe('putDocument + getDocument', () => {
    it('creates and retrieves a document', async () => {
      const p = createProvider();
      const doc = await p.putDocument<{ x: number }>(
        { key: 'test', schemaVersion: 1, updatedAt: '', data: { x: 42 } },
      );
      expect(doc.key).toBe('test');
      expect(doc.data).toEqual({ x: 42 });
      expect(doc.revision).toBeDefined();

      const retrieved = await p.getDocument<{ x: number }>('test');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.data).toEqual({ x: 42 });
    });

    it('updates an existing document', async () => {
      const p = createProvider();
      await p.putDocument<{ v: number }>({ key: 'cfg', schemaVersion: 1, updatedAt: '', data: { v: 1 } });
      const updated = await p.putDocument<{ v: number }>({ key: 'cfg', schemaVersion: 1, updatedAt: '', data: { v: 2 } });
      expect(updated.data).toEqual({ v: 2 });

      const retrieved = await p.getDocument<{ v: number }>('cfg');
      expect(retrieved!.data).toEqual({ v: 2 });
    });

    it('propagates revision from record changeTag', async () => {
      const p = createProvider();
      const doc = await p.putDocument<{ x: number }>({ key: 'rev-test', schemaVersion: 1, updatedAt: '', data: { x: 1 } });
      expect(doc.revision).toBe('tag-1');
    });

    it('preserves schemaVersion', async () => {
      const p = createProvider();
      await p.putDocument<{ x: number }>({ key: 'schema', schemaVersion: 3, updatedAt: '', data: { x: 1 } });
      const retrieved = await p.getDocument<{ x: number }>('schema');
      expect(retrieved!.schemaVersion).toBe(3);
    });
  });

  describe('deleteDocument', () => {
    it('removes a document', async () => {
      const p = createProvider();
      await p.putDocument<{ x: number }>({ key: 'del-me', schemaVersion: 1, updatedAt: '', data: { x: 1 } });
      await p.deleteDocument('del-me');
      const result = await p.getDocument<{ x: number }>('del-me');
      expect(result).toBeNull();
    });

    it('is a no-op for missing key', async () => {
      const p = createProvider();
      await expect(p.deleteDocument('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('listDocuments', () => {
    it('returns empty array when nothing stored', async () => {
      const p = createProvider();
      const list = await p.listDocuments();
      expect(list).toEqual([]);
    });

    it('returns all stored documents as summaries', async () => {
      const p = createProvider();
      await p.putDocument<{ a: number }>({ key: 'a', schemaVersion: 1, updatedAt: '', data: { a: 1 } });
      await p.putDocument<{ b: number }>({ key: 'b', schemaVersion: 1, updatedAt: '', data: { b: 2 } });
      const list = await p.listDocuments();
      expect(list).toHaveLength(2);
      const keys = list.map(s => s.key).sort();
      expect(keys).toEqual(['a', 'b']);
      for (const s of list) {
        expect(s.updatedAt).toBeDefined();
      }
    });
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/__tests__/record-backed-document-provider.test.ts`
Expected: FAIL — module `../providers/record-backed-document-provider.js` not found

---

### Task 4: RecordBackedDocumentProvider — Implementation

**Files:**
- Create: `packages/core/src/providers/record-backed-document-provider.ts`

- [ ] **Step 8: Write the RecordBackedDocumentProvider implementation**

```ts
import type {
  DocumentStoreProvider,
  ProviderId,
  PutOptions,
  SettingsEnvelope,
  SettingsSummary,
  ConnectedProfile,
} from '../types.js';

export interface CloudRecord {
  recordName: string;
  modifiedAt?: string;
  changeTag?: string;
  fields: Record<string, unknown>;
}

export abstract class RecordBackedDocumentProvider implements DocumentStoreProvider {
  abstract readonly id: ProviderId;

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): Promise<boolean>;
  abstract getProfile(): Promise<ConnectedProfile | null>;

  protected abstract getRecord(key: string): Promise<CloudRecord | null>;
  protected abstract saveRecord(record: CloudRecord, options?: PutOptions): Promise<CloudRecord>;
  protected abstract removeRecord(key: string): Promise<void>;
  protected abstract listRecords(): Promise<CloudRecord[]>;

  async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    const record = await this.getRecord(key);
    if (!record) return null;
    return {
      key,
      schemaVersion: Number(record.fields.schemaVersion ?? 1),
      updatedAt: String(record.fields.updatedAt ?? record.modifiedAt ?? new Date(0).toISOString()),
      revision: record.changeTag,
      data: record.fields.data as T,
    };
  }

  async putDocument<T>(doc: SettingsEnvelope<T>, options?: PutOptions): Promise<SettingsEnvelope<T>> {
    const saved = await this.saveRecord({
      recordName: doc.key,
      changeTag: doc.revision,
      fields: {
        key: doc.key,
        schemaVersion: doc.schemaVersion,
        updatedAt: new Date().toISOString(),
        data: doc.data,
      },
    }, options);

    return {
      key: doc.key,
      schemaVersion: Number(saved.fields.schemaVersion ?? doc.schemaVersion),
      updatedAt: String(saved.fields.updatedAt ?? new Date().toISOString()),
      revision: saved.changeTag,
      data: saved.fields.data as T,
    };
  }

  async deleteDocument(key: string): Promise<void> {
    await this.removeRecord(key);
  }

  async listDocuments(): Promise<SettingsSummary[]> {
    const records = await this.listRecords();
    return records.map(r => ({
      key: r.recordName,
      updatedAt: String(r.fields.updatedAt ?? r.modifiedAt ?? new Date(0).toISOString()),
      revision: r.changeTag,
    }));
  }
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/__tests__/record-backed-document-provider.test.ts`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/providers/record-backed-document-provider.ts packages/core/src/__tests__/record-backed-document-provider.test.ts
git commit -m "feat(core): add RecordBackedDocumentProvider abstract class with tests"
```

---

### Task 5: Barrel Export and Final Verification

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 11: Update barrel export to include both provider modules**

Change `packages/core/src/index.ts` to:

```ts
export * from './types.js';
export * from './errors.js';
export * from './providers/file-backed-document-provider.js';
export * from './providers/record-backed-document-provider.js';
```

- [ ] **Step 12: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: ALL PASS (all existing + new tests)

- [ ] **Step 13: Run typecheck**

Run: `cd packages/core && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 14: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export FileBackedDocumentProvider and RecordBackedDocumentProvider from barrel"