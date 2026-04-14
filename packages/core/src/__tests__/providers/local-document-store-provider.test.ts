import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDocumentStoreProvider } from '../../providers/local-document-store-provider.js';
import { NotConnectedError, ConflictError } from '../../errors.js';

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
  });

  describe('Operations when disconnected', () => {
    it('throws NotConnectedError', async () => {
      const provider = new LocalDocumentStoreProvider();

      await expect(provider.getDocument('key')).rejects.toThrow(NotConnectedError);
      await expect(provider.putDocument({ key: 'key', schemaVersion: 1, updatedAt: '', data: {} })).rejects.toThrow(NotConnectedError);
      await expect(provider.deleteDocument('key')).rejects.toThrow(NotConnectedError);
      await expect(provider.listDocuments()).rejects.toThrow(NotConnectedError);
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
      const saved1 = await provider.putDocument(doc);

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
      await expect(provider.putDocument(doc2, { expectedRevision: 'rev-999' })).rejects.toThrow(ConflictError);
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
      expect(summaries.map(s => s.key)).toContain('test1');
      expect(summaries.map(s => s.key)).toContain('test2');
      expect(summaries[0].revision).toBeDefined();
      expect(summaries[0].updatedAt).not.toBe('');
    });
  });
});
