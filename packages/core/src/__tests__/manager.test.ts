import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultSettingsStore } from '../manager.js';
import {
  NotConnectedError,
  UnsupportedProviderError,
  ProviderUnavailableError,
} from '../errors.js';
import type {
  ConnectedProfile,
  DocumentStoreProvider,
  ProviderDescriptor,
  ProviderId,
  PutOptions,
  SettingsEnvelope,
  SettingsSummary,
} from '../types.js';

class FakeProvider implements DocumentStoreProvider {
  public id: ProviderId = 'local';
  public isConnectedValue = false;
  public profile: ConnectedProfile | null = null;
  public documents = new Map<string, SettingsEnvelope<any>>();
  public connectCalled = false;
  public disconnectCalled = false;

  public async connect(): Promise<void> {
    this.isConnectedValue = true;
    this.connectCalled = true;
  }

  public async disconnect(): Promise<void> {
    this.isConnectedValue = false;
    this.disconnectCalled = true;
  }

  public async isConnected(): Promise<boolean> {
    return this.isConnectedValue;
  }

  public async getProfile(): Promise<ConnectedProfile | null> {
    return this.profile;
  }

  public async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    return (this.documents.get(key) as SettingsEnvelope<T>) ?? null;
  }

  public async putDocument<T>(
    doc: SettingsEnvelope<T>,
    options?: PutOptions
  ): Promise<SettingsEnvelope<T>> {
    const newDoc = { ...doc, revision: `rev-${Date.now()}`, updatedAt: new Date().toISOString() };
    this.documents.set(doc.key, newDoc);
    return newDoc;
  }

  public async deleteDocument(key: string): Promise<void> {
    this.documents.delete(key);
  }

  public async listDocuments(): Promise<SettingsSummary[]> {
    return Array.from(this.documents.values()).map(doc => ({
      key: doc.key,
      updatedAt: doc.updatedAt,
      revision: doc.revision,
    }));
  }
}

describe('DefaultSettingsStore', () => {
  let store: DefaultSettingsStore;
  let registry: Map<ProviderId, ProviderDescriptor>;
  let fakeProvider: FakeProvider;

  beforeEach(() => {
    fakeProvider = new FakeProvider();

    registry = new Map<ProviderId, ProviderDescriptor>();

    registry.set('local', {
      id: 'local',
      label: 'Local',
      capabilities: [],
      isSupported: async () => true,
      create: () => fakeProvider,
    });

    registry.set('google-drive', {
      id: 'google-drive',
      label: 'Google Drive',
      capabilities: [],
      isSupported: async () => false, // simulate unsupported
      create: () => new FakeProvider(), // shouldn't be called
    });

    store = new DefaultSettingsStore(registry);
  });

  describe('Connection Lifecycle', () => {
    it('connects to a supported provider', async () => {
      await store.connect('local');
      expect(fakeProvider.connectCalled).toBe(true);
      expect(store.currentProvider()).toBe('local');
      expect(await store.isConnected()).toBe(true);
    });

    it('throws UnsupportedProviderError for unknown provider', async () => {
      // @ts-expect-error Testing invalid input
      await expect(store.connect('unknown-provider')).rejects.toThrow(UnsupportedProviderError);
    });

    it('throws ProviderUnavailableError for unsupported provider', async () => {
      await expect(store.connect('google-drive')).rejects.toThrow(ProviderUnavailableError);
    });

    it('disconnects previous provider when connecting to a new one', async () => {
      const provider1 = new FakeProvider();
      const provider2 = new FakeProvider();
      provider2.id = 'dropbox';

      registry.set('local', {
        id: 'local',
        label: 'Local',
        capabilities: [],
        isSupported: async () => true,
        create: () => provider1,
      });
      registry.set('dropbox', {
        id: 'dropbox',
        label: 'Dropbox',
        capabilities: [],
        isSupported: async () => true,
        create: () => provider2,
      });

      await store.connect('local');
      expect(provider1.connectCalled).toBe(true);

      await store.connect('dropbox');
      expect(provider1.disconnectCalled).toBe(true);
      expect(provider2.connectCalled).toBe(true);
      expect(store.currentProvider()).toBe('dropbox');
    });

    it('disconnects current provider', async () => {
      await store.connect('local');
      await store.disconnect();
      expect(fakeProvider.disconnectCalled).toBe(true);
      expect(store.currentProvider()).toBeNull();
      expect(await store.isConnected()).toBe(false);
    });

    it('getProfile delegates to provider or returns null if not connected', async () => {
      expect(await store.getProfile()).toBeNull();

      fakeProvider.profile = { provider: 'local', accountId: '123' };
      await store.connect('local');
      expect(await store.getProfile()).toEqual({ provider: 'local', accountId: '123' });
    });
  });

  describe('CRUD operations', () => {
    it('throws NotConnectedError if not connected', async () => {
      await expect(store.get('key')).rejects.toThrow(NotConnectedError);
      await expect(store.put('key', { data: 1 })).rejects.toThrow(NotConnectedError);
      await expect(store.delete('key')).rejects.toThrow(NotConnectedError);
      await expect(store.list()).rejects.toThrow(NotConnectedError);
    });

    describe('when connected', () => {
      beforeEach(async () => {
        await store.connect('local');
      });

      it('get returns existing document or null', async () => {
        expect(await store.get('foo')).toBeNull();

        const doc: SettingsEnvelope<{ val: string }> = {
          key: 'foo',
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          data: { val: 'test' },
        };
        fakeProvider.documents.set('foo', doc);

        expect(await store.get('foo')).toEqual(doc);
      });

      it('put creates new document with schemaVersion 1', async () => {
        const result = await store.put('bar', { hello: 'world' });
        expect(result.key).toBe('bar');
        expect(result.schemaVersion).toBe(1);
        expect(result.data).toEqual({ hello: 'world' });
        expect(result.revision).toMatch(/^rev-/);

        expect(fakeProvider.documents.get('bar')?.data).toEqual({ hello: 'world' });
      });

      it('put preserves schemaVersion of existing document', async () => {
        fakeProvider.documents.set('bar', {
          key: 'bar',
          schemaVersion: 3,
          updatedAt: new Date().toISOString(),
          revision: 'rev-old',
          data: { hello: 'old' },
        });

        const result = await store.put('bar', { hello: 'new' });
        expect(result.schemaVersion).toBe(3);
        expect(result.data).toEqual({ hello: 'new' });
        // The mock putDocument replaces the revision, checking that merge worked properly before
        // The fact it found it means it was passed through.
      });

      it('put calls provider putDocument with expected revision if options passed', async () => {
        const putSpy = vi.spyOn(fakeProvider, 'putDocument');
        await store.put('baz', { a: 1 }, { expectedRevision: 'rev-abc' });

        expect(putSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            key: 'baz',
            data: { a: 1 },
            schemaVersion: 1,
          }),
          { expectedRevision: 'rev-abc' }
        );
      });

      it('delete removes the document', async () => {
        fakeProvider.documents.set('foo', {
          key: 'foo',
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          data: {},
        });

        await store.delete('foo');
        expect(fakeProvider.documents.has('foo')).toBe(false);
      });

      it('list returns document summaries', async () => {
        const doc1 = {
          key: 'doc1',
          schemaVersion: 1,
          updatedAt: '2020-01-01',
          revision: 'rev-1',
          data: {},
        };
        const doc2 = {
          key: 'doc2',
          schemaVersion: 1,
          updatedAt: '2020-01-02',
          revision: 'rev-2',
          data: {},
        };
        fakeProvider.documents.set('doc1', doc1);
        fakeProvider.documents.set('doc2', doc2);

        const summaries = await store.list();
        expect(summaries).toHaveLength(2);
        expect(summaries).toEqual(
          expect.arrayContaining([
            { key: 'doc1', updatedAt: '2020-01-01', revision: 'rev-1' },
            { key: 'doc2', updatedAt: '2020-01-02', revision: 'rev-2' },
          ])
        );
      });
    });
  });
});
