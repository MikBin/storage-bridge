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
