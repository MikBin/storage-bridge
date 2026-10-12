import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDocumentStoreProvider } from '../../providers/local-document-store-provider.js';
import { NotConnectedError, ConflictError } from '../../errors.js';

/**
 * Full observable store universe for one provider instance: every document
 * envelope (via getDocument) plus the listDocuments() summary surface. Used
 * for strict before/after state-delta comparisons across disconnect.
 */
async function captureStoreState(
  provider: LocalDocumentStoreProvider,
): Promise<{ documents: Record<string, unknown>; summaries: unknown[] }> {
  const summaries = await provider.listDocuments();
  const documents: Record<string, unknown> = {};
  for (const summary of summaries) {
    documents[summary.key] = await provider.getDocument(summary.key);
  }
  return { documents, summaries };
}

describe('LocalDocumentStoreProvider', () => {
  describe('Connection Lifecycle', () => {
    it('starts disconnected', async () => {
      const provider = new LocalDocumentStoreProvider();
      expect(await provider.isConnected()).toBe(false);
      expect(await provider.getProfile()).toBeNull();
    });

    it('connects and disconnects', async () => {
      const provider = new LocalDocumentStoreProvider();
      await provider.connect();
      expect(await provider.isConnected()).toBe(true);
      expect(await provider.getProfile()).toEqual({ provider: 'local', accountId: 'local' });

      await provider.disconnect();
      expect(await provider.isConnected()).toBe(false);
      expect(await provider.getProfile()).toBeNull();
    });

    it('persists data across disconnect and reconnect', async () => {
      const provider = new LocalDocumentStoreProvider();
      await provider.connect();
      await provider.putDocument({
        key: 'pref',
        schemaVersion: 1,
        updatedAt: '',
        data: { theme: 'dark' },
      });

      await provider.disconnect();
      expect(await provider.isConnected()).toBe(false);

      await provider.connect();
      expect(await provider.isConnected()).toBe(true);
      const retrieved = await provider.getDocument('pref');
      expect(retrieved?.data).toEqual({ theme: 'dark' });
    });
  });

  describe('Operations when disconnected', () => {
    // bypass: fast-check not installed; deterministic rejection matrix over
    // every data operation of the provider port (getDocument, putDocument,
    // deleteDocument, listDocuments), matching the contract policy from 01-01.
    it('rejects NotConnectedError for every data operation before connect()', async () => {
      const provider = new LocalDocumentStoreProvider();

      await expect(provider.getDocument('key')).rejects.toThrow(NotConnectedError);
      await expect(
        provider.putDocument({ key: 'key', schemaVersion: 1, updatedAt: '', data: {} }),
      ).rejects.toThrow(NotConnectedError);
      await expect(provider.deleteDocument('key')).rejects.toThrow(NotConnectedError);
      await expect(provider.listDocuments()).rejects.toThrow(NotConnectedError);
    });
  });

  describe('Persistence across disconnect', () => {
    // bypass: fast-check not installed; deterministic case matrix over the
    // full observable store universe (documents + revisions + summaries).
    // State-delta: disconnect/reconnect must leave EVERY slot unchanged.
    it('disconnect() preserves documents and revisions; reconnect observes identical state', async () => {
      const provider = new LocalDocumentStoreProvider();
      await provider.connect();
      await provider.putDocument({
        key: 'persist-a',
        schemaVersion: 1,
        updatedAt: '',
        data: { n: 1 },
      });
      await provider.putDocument({
        key: 'persist-a',
        schemaVersion: 1,
        updatedAt: '',
        data: { n: 2 },
      });
      await provider.putDocument({
        key: 'persist-b',
        schemaVersion: 1,
        updatedAt: '',
        data: { n: 3 },
      });

      const before = await captureStoreState(provider);

      await provider.disconnect();
      await provider.connect();

      const after = await captureStoreState(provider);
      expect(after).toEqual(before);

      // The per-key revision counter survived the disconnect: the next write
      // continues the sequence instead of restarting at rev-1.
      const nextPut = await provider.putDocument({
        key: 'persist-a',
        schemaVersion: 1,
        updatedAt: '',
        data: { n: 4 },
      });
      expect(nextPut.revision).toBe('rev-3');
    });

    it('disconnect() on an empty store keeps the store empty', async () => {
      const provider = new LocalDocumentStoreProvider();
      await provider.connect();
      await provider.disconnect();
      await provider.connect();
      expect(await provider.listDocuments()).toEqual([]);
    });
  });

  describe('CRUD Operations', () => {
    let provider: LocalDocumentStoreProvider;

    beforeEach(async () => {
      provider = new LocalDocumentStoreProvider();
      await provider.connect();
    });

    it('getDocument returns null for missing doc', async () => {
      expect(await provider.getDocument('missing')).toBeNull();
    });

    it('putDocument creates new doc with revision', async () => {
      const doc = { key: 'test', schemaVersion: 1, updatedAt: '', data: { foo: 'bar' } };
      const saved = await provider.putDocument(doc);

      expect(saved.key).toBe('test');
      expect(saved.data).toEqual({ foo: 'bar' });
      expect(saved.revision).toBe('rev-1');
      expect(saved.updatedAt).not.toBe('');

      const retrieved = await provider.getDocument('test');
      expect(retrieved).toEqual(saved);
    });

    it('putDocument increments revision on update', async () => {
      const doc = { key: 'test', schemaVersion: 1, updatedAt: '', data: { foo: 'bar' } };
      await provider.putDocument(doc);

      const doc2 = { key: 'test', schemaVersion: 1, updatedAt: '', data: { foo: 'baz' } };
      const saved2 = await provider.putDocument(doc2);

      expect(saved2.revision).toBe('rev-2');
      expect(saved2.data).toEqual({ foo: 'baz' });
    });

    it('putDocument with expectedRevision succeeds when matching', async () => {
      const doc = { key: 'test', schemaVersion: 1, updatedAt: '', data: { foo: 'bar' } };
      const saved1 = await provider.putDocument(doc);

      const doc2 = { key: 'test', schemaVersion: 1, updatedAt: '', data: { foo: 'baz' } };
      const saved2 = await provider.putDocument(doc2, { expectedRevision: saved1.revision });

      expect(saved2.revision).toBe('rev-2');
    });

    it('putDocument with expectedRevision throws ConflictError when mismatched', async () => {
      const doc = { key: 'test', schemaVersion: 1, updatedAt: '', data: { foo: 'bar' } };
      await provider.putDocument(doc);

      const doc2 = { key: 'test', schemaVersion: 1, updatedAt: '', data: { foo: 'baz' } };
      await expect(provider.putDocument(doc2, { expectedRevision: 'rev-999' })).rejects.toThrow(
        ConflictError,
      );
    });

    it('putDocument with force overwrites despite a stale expectedRevision (D2)', async () => {
      const doc = { key: 'test', schemaVersion: 1, updatedAt: '', data: { foo: 'bar' } };
      await provider.putDocument(doc);

      const doc2 = { key: 'test', schemaVersion: 1, updatedAt: '', data: { foo: 'forced' } };
      const forced = await provider.putDocument(doc2, { expectedRevision: 'rev-999', force: true });

      expect(forced.revision).toBe('rev-2');
      expect(forced.data).toEqual({ foo: 'forced' });
      expect((await provider.getDocument('test'))?.data).toEqual({ foo: 'forced' });
    });

    it('deleteDocument removes doc', async () => {
      const doc = { key: 'test', schemaVersion: 1, updatedAt: '', data: { foo: 'bar' } };
      await provider.putDocument(doc);

      await provider.deleteDocument('test');
      expect(await provider.getDocument('test')).toBeNull();
    });

    it('listDocuments returns summaries', async () => {
      const doc1 = { key: 'test1', schemaVersion: 1, updatedAt: '', data: {} };
      const doc2 = { key: 'test2', schemaVersion: 1, updatedAt: '', data: {} };

      await provider.putDocument(doc1);
      await provider.putDocument(doc2);

      const summaries = await provider.listDocuments();
      expect(summaries).toHaveLength(2);
      expect(summaries.map((s) => s.key)).toContain('test1');
      expect(summaries.map((s) => s.key)).toContain('test2');
      expect(summaries[0].revision).toBeDefined();
      expect(summaries[0].updatedAt).not.toBe('');
    });
  });
});
