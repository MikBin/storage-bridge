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
