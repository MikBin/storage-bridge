# Provider Port and Base Adapters Design

**Task:** TASK-3 — Provider Port and Base Adapters
**Date:** 2026-04-14
**Status:** Draft
**Depends on:** TASK-2 (Core Types and Error Classes) — complete

## Overview

Implement two abstract base adapter classes that implement the `DocumentStoreProvider` interface from TASK-2. `FileBackedDocumentProvider` normalizes cloud providers that expose an app-scoped filesystem (Google Drive, Dropbox, OneDrive). `RecordBackedDocumentProvider` normalizes record-oriented cloud providers (iCloud CloudKit). Concrete providers extend one of these and implement a small set of primitive operations.

## Design Decisions

### 1. `DocumentStoreProvider` stays in `types.ts`

**Choice:** The `DocumentStoreProvider` interface remains in `packages/core/src/types.ts` where TASK-2 placed it. The task description mentioned creating `src/providers/document-store-provider.ts`, but the interface is already shipped alongside `ProviderDescriptor` which references it.

**Rationale:** Moving it would break the reviewed TASK-2 design. The new abstract classes import from `../types.js`.

### 2. One file per abstract class

**Choice:** Two new files in `packages/core/src/providers/`:

```
src/providers/
├── file-backed-document-provider.ts   # FileEntry + FileBackedDocumentProvider
└── record-backed-document-provider.ts # CloudRecord + RecordBackedDocumentProvider
```

**Rationale:** Each file has a single clear purpose. Follows the architecture doc structure.

### 3. `keyToFileName` / `fileNameToKey` are protected virtual

**Choice:** These methods are `protected` (not `abstract`) with default implementations using `encodeURIComponent` + `.json` suffix. Subclasses can override if needed.

**Rationale:** All three file-backed providers use the same naming convention. No need to force reimplementation.

### 4. Error handling in base classes

**Choice:** The base classes do not throw provider-specific errors. They delegate to abstract methods and let concrete implementations decide error semantics. `getDocument` returns `null` when the underlying read returns `null`.

**Rationale:** Base classes are thin delegation layers. Error mapping is the concrete provider's responsibility.

### 5. `PutOptions` passed through to abstract methods

**Choice:** `FileBackedDocumentProvider.writeFile` and `RecordBackedDocumentProvider.saveRecord` receive `PutOptions` so concrete providers can implement optimistic concurrency (e.g., `If-Match` headers).

**Rationale:** The architecture doc passes `options` through. Without it, providers cannot implement revision conflict detection.

## File Structure

```
packages/core/src/
├── index.ts                                      # updated: re-export providers/*
├── types.ts                                      # unchanged
├── errors.ts                                     # unchanged
├── providers/
│   ├── file-backed-document-provider.ts          # FileEntry + FileBackedDocumentProvider
│   └── record-backed-document-provider.ts        # CloudRecord + RecordBackedDocumentProvider
└── __tests__/
    ├── types.test.ts                              # unchanged
    ├── errors.test.ts                             # unchanged
    ├── file-backed-document-provider.test.ts      # NEW
    └── record-backed-document-provider.test.ts    # NEW
```

## FileBackedDocumentProvider

### `FileEntry` interface

```ts
export interface FileEntry {
  id: string;
  logicalKey: string;
  name: string;
  updatedAt?: string;
  revision?: string;
  size?: number;
}
```

### Class design

```ts
export abstract class FileBackedDocumentProvider implements DocumentStoreProvider {
  abstract readonly id: ProviderId;

  // DocumentStoreProvider lifecycle — subclasses implement
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): Promise<boolean>;
  abstract getProfile(): Promise<ConnectedProfile | null>;

  // File primitives — subclasses implement
  protected abstract readFile(fileName: string): Promise<{ text: string; meta: FileEntry } | null>;
  protected abstract writeFile(fileName: string, body: string, options?: PutOptions): Promise<FileEntry>;
  protected abstract removeFile(fileName: string): Promise<void>;
  protected abstract listFiles(): Promise<FileEntry[]>;

  // Key↔filename conversion — overridable defaults
  protected keyToFileName(key: string): string {
    return `${encodeURIComponent(key)}.json`;
  }

  protected fileNameToKey(fileName: string): string {
    return decodeURIComponent(fileName.replace(/\.json$/, ''));
  }

  // DocumentStoreProvider document operations — base class implements
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

### Method responsibility table

| Method | Provided by | Purpose |
|--------|-------------|---------|
| `id` | subclass | Provider identifier |
| `connect/disconnect/isConnected/getProfile` | subclass | Auth lifecycle |
| `readFile/writeFile/removeFile/listFiles` | subclass | Raw file I/O against cloud API |
| `keyToFileName/fileNameToKey` | base (overridable) | Key↔filename encoding |
| `getDocument/putDocument/deleteDocument/listDocuments` | base | Document↔file translation |

## RecordBackedDocumentProvider

### `CloudRecord` interface

```ts
export interface CloudRecord {
  recordName: string;
  modifiedAt?: string;
  changeTag?: string;
  fields: Record<string, unknown>;
}
```

### Class design

```ts
export abstract class RecordBackedDocumentProvider implements DocumentStoreProvider {
  abstract readonly id: ProviderId;

  // DocumentStoreProvider lifecycle — subclasses implement
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): Promise<boolean>;
  abstract getProfile(): Promise<ConnectedProfile | null>;

  // Record primitives — subclasses implement
  protected abstract getRecord(key: string): Promise<CloudRecord | null>;
  protected abstract saveRecord(record: CloudRecord, options?: PutOptions): Promise<CloudRecord>;
  protected abstract removeRecord(key: string): Promise<void>;
  protected abstract listRecords(): Promise<CloudRecord[]>;

  // DocumentStoreProvider document operations — base class implements
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

### Method responsibility table

| Method | Provided by | Purpose |
|--------|-------------|---------|
| `id` | subclass | Provider identifier |
| `connect/disconnect/isConnected/getProfile` | subclass | Auth lifecycle |
| `getRecord/saveRecord/removeRecord/listRecords` | subclass | Raw record I/O against cloud API |
| `getDocument/putDocument/deleteDocument/listDocuments` | base | Document↔record translation |

## Testing

### In-memory stubs

Two test-only concrete implementations:

**`InMemoryFileProvider`** extends `FileBackedDocumentProvider`:
- Uses `Map<string, { body: string; meta: FileEntry }>` to simulate a filesystem
- `readFile` returns the stored entry or `null`
- `writeFile` upserts the entry, increments a revision counter
- `removeFile` deletes the entry (no-op if missing)
- `listFiles` returns all entries

**`InMemoryRecordProvider`** extends `RecordBackedDocumentProvider`:
- Uses `Map<string, CloudRecord>` to simulate a record store
- `getRecord` returns the stored record or `null`
- `saveRecord` upserts the record, updates `modifiedAt` and `changeTag`
- `removeRecord` deletes the record (no-op if missing)
- `listRecords` returns all records

### Test cases per base adapter

1. **getDocument returns null for missing key**
2. **putDocument creates new document** — stores and returns envelope with updated `updatedAt`
3. **getDocument retrieves previously put document** — round-trip integrity
4. **putDocument updates existing document** — overwrite preserves key, updates data
5. **deleteDocument removes document** — subsequent get returns null
6. **deleteDocument is no-op for missing key** — no error thrown
7. **listDocuments returns all stored documents** — correct summaries
8. **listDocuments returns empty array when nothing stored**
9. **keyToFileName encodes key with .json suffix** — special characters handled
10. **fileNameToKey reverses keyToFileName** — round-trip identity
11. **Revision propagates from file/record metadata** — meta.revision takes precedence

### Barrel export update

`src/index.ts` updated to:
```ts
export * from './types.js';
export * from './errors.js';
export * from './providers/file-backed-document-provider.js';
export * from './providers/record-backed-document-provider.js';
```

## Acceptance Criteria Mapping

| AC | How Satisfied |
|----|---------------|
| #1 DocumentStoreProvider interface defined | Already in `types.ts` from TASK-2; re-exported through `index.ts` |
| #2 FileBackedDocumentProvider abstract class with FileEntry interface | `src/providers/file-backed-document-provider.ts` |
| #3 RecordBackedDocumentProvider abstract class with CloudRecord interface | `src/providers/record-backed-document-provider.ts` |
| #4 Unit tests with in-memory stubs for both base adapters | `__tests__/file-backed-document-provider.test.ts` and `__tests__/record-backed-document-provider.test.ts` |

## Out of Scope

- Concrete provider implementations (Google Drive, Dropbox, OneDrive, iCloud) — later tasks
- `DefaultSettingsStore` — TASK-4
- `ProviderRegistry` / `createSettingsStore` — TASK-5
- OAuth types — auth packages
- `provider-local` — separate task