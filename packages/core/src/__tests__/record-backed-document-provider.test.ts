import { describe, it, expect, vi } from 'vitest';
import type { CloudRecord } from '../providers/record-backed-document-provider.js';
import { RecordBackedDocumentProvider } from '../providers/record-backed-document-provider.js';
import { ConflictError } from '../errors.js';
import type { ProviderId, PutOptions, ConnectedProfile } from '../types.js';

class InMemoryRecordProvider extends RecordBackedDocumentProvider {
  readonly id: ProviderId = 'icloud';
  private store = new Map<string, CloudRecord>();
  private tagCounter = 0;

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async isConnected(): Promise<boolean> {
    return true;
  }
  async getProfile(): Promise<ConnectedProfile | null> {
    return { provider: this.id };
  }

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
      const doc = await p.putDocument<{ x: number }>({
        key: 'test',
        schemaVersion: 1,
        updatedAt: '',
        data: { x: 42 },
      });
      expect(doc.key).toBe('test');
      expect(doc.data).toEqual({ x: 42 });
      expect(doc.revision).toBeDefined();

      const retrieved = await p.getDocument<{ x: number }>('test');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.data).toEqual({ x: 42 });
    });

    it('updates an existing document', async () => {
      const p = createProvider();
      await p.putDocument<{ v: number }>({
        key: 'cfg',
        schemaVersion: 1,
        updatedAt: '',
        data: { v: 1 },
      });
      const updated = await p.putDocument<{ v: number }>({
        key: 'cfg',
        schemaVersion: 1,
        updatedAt: '',
        data: { v: 2 },
      });
      expect(updated.data).toEqual({ v: 2 });

      const retrieved = await p.getDocument<{ v: number }>('cfg');
      expect(retrieved!.data).toEqual({ v: 2 });
    });

    it('propagates revision from record changeTag', async () => {
      const p = createProvider();
      const doc = await p.putDocument<{ x: number }>({
        key: 'rev-test',
        schemaVersion: 1,
        updatedAt: '',
        data: { x: 1 },
      });
      expect(doc.revision).toBe('tag-1');
    });

    it('preserves schemaVersion', async () => {
      const p = createProvider();
      await p.putDocument<{ x: number }>({
        key: 'schema',
        schemaVersion: 3,
        updatedAt: '',
        data: { x: 1 },
      });
      const retrieved = await p.getDocument<{ x: number }>('schema');
      expect(retrieved!.schemaVersion).toBe(3);
    });
  });

  describe('deleteDocument', () => {
    it('removes a document', async () => {
      const p = createProvider();
      await p.putDocument<{ x: number }>({
        key: 'del-me',
        schemaVersion: 1,
        updatedAt: '',
        data: { x: 1 },
      });
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
      await p.putDocument<{ a: number }>({
        key: 'a',
        schemaVersion: 1,
        updatedAt: '',
        data: { a: 1 },
      });
      await p.putDocument<{ b: number }>({
        key: 'b',
        schemaVersion: 1,
        updatedAt: '',
        data: { b: 2 },
      });
      const list = await p.listDocuments();
      expect(list).toHaveLength(2);
      const keys = list.map((s) => s.key).sort();
      expect(keys).toEqual(['a', 'b']);
      for (const s of list) {
        expect(s.updatedAt).toBeDefined();
      }
    });
  });

  describe('changeTag provenance (D2: explicit expectations only)', () => {
    it('plain putDocument never derives changeTag from the document revision', async () => {
      const p = createProvider();
      const saveSpy = vi.spyOn(
        p as unknown as { saveRecord: (r: CloudRecord, o?: PutOptions) => Promise<CloudRecord> },
        'saveRecord',
      );

      await p.putDocument<{ v: number }>({
        key: 'implicit-tag',
        schemaVersion: 1,
        updatedAt: '',
        revision: 'stale-tag-from-document',
        data: { v: 1 },
      });

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy.mock.calls[0][0].changeTag).toBeUndefined();
    });

    it('explicit expectedRevision is forwarded as changeTag', async () => {
      const p = createProvider();
      const seeded = await p.putDocument<{ v: number }>({
        key: 'explicit-tag',
        schemaVersion: 1,
        updatedAt: '',
        data: { v: 1 },
      });
      const saveSpy = vi.spyOn(
        p as unknown as { saveRecord: (r: CloudRecord, o?: PutOptions) => Promise<CloudRecord> },
        'saveRecord',
      );

      await p.putDocument<{ v: number }>(
        {
          key: 'explicit-tag',
          schemaVersion: 1,
          updatedAt: '',
          revision: 'ignored-document-tag',
          data: { v: 2 },
        },
        { expectedRevision: seeded.revision },
      );

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy.mock.calls[0][0].changeTag).toBe(seeded.revision);
    });

    it('force suppresses the changeTag even with an explicit expectation', async () => {
      const p = createProvider();
      const saveSpy = vi.spyOn(
        p as unknown as { saveRecord: (r: CloudRecord, o?: PutOptions) => Promise<CloudRecord> },
        'saveRecord',
      );

      await p.putDocument<{ v: number }>(
        { key: 'force-tag', schemaVersion: 1, updatedAt: '', data: { v: 1 } },
        { expectedRevision: 'stale-expectation', force: true },
      );

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy.mock.calls[0][0].changeTag).toBeUndefined();
    });

    it('expectedRevision against a non-existent key rejects with ConflictError (uniform rule)', async () => {
      const p = createProvider();
      await expect(
        p.putDocument<{ v: number }>(
          { key: 'missing-record', schemaVersion: 1, updatedAt: '', data: { v: 1 } },
          { expectedRevision: 'revision-of-a-never-written-key' },
        ),
      ).rejects.toThrow(ConflictError);
    });

    it('expectedRevision matching an advanced changeTag rejects with ConflictError', async () => {
      const p = createProvider();
      await p.putDocument<{ v: number }>({
        key: 'stale-target',
        schemaVersion: 1,
        updatedAt: '',
        data: { v: 1 },
      });

      await expect(
        p.putDocument<{ v: number }>(
          { key: 'stale-target', schemaVersion: 1, updatedAt: '', data: { v: 2 } },
          { expectedRevision: 'not-the-current-tag' },
        ),
      ).rejects.toThrow(ConflictError);
    });
  });
});
