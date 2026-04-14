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