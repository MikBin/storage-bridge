import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultSettingsStore } from '../manager.js';
import {
  ConflictError,
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
    _options?: PutOptions,
  ): Promise<SettingsEnvelope<T>> {
    const newDoc = { ...doc, revision: `rev-${Date.now()}`, updatedAt: new Date().toISOString() };
    this.documents.set(doc.key, newDoc);
    return newDoc;
  }

  public async deleteDocument(key: string): Promise<void> {
    this.documents.delete(key);
  }

  public async listDocuments(): Promise<SettingsSummary[]> {
    return Array.from(this.documents.values()).map((doc) => ({
      key: doc.key,
      updatedAt: doc.updatedAt,
      revision: doc.revision,
    }));
  }
}

/**
 * Concurrency-enforcing double: rejects when the stored revision does not
 * match options.expectedRevision — including the uniform missing-key rule
 * (an expectation against a never-written key rejects).
 */
class ConcurrencyEnforcingProvider implements DocumentStoreProvider {
  public readonly id: ProviderId = 'local';
  public readonly documents = new Map<string, SettingsEnvelope<unknown>>();
  private readonly revCounters = new Map<string, number>();
  private connected = false;

  /**
   * Deterministic interleaving gate: when set, getDocument() suspends until
   * the promise resolves, letting a remote writer land between the manager's
   * internal read and its provider write.
   */
  public readGate: Promise<void> | null = null;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  async getProfile(): Promise<ConnectedProfile | null> {
    return this.connected ? { provider: this.id } : null;
  }

  async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    // Capture BEFORE parking: models a stale in-flight read — the payload is
    // fixed when the read starts, and the remote write lands while it is
    // parked on the gate.
    const entry = this.documents.get(key) ?? null;
    if (this.readGate) {
      await this.readGate;
    }
    return (entry as SettingsEnvelope<T>) ?? null;
  }

  async putDocument<T>(
    doc: SettingsEnvelope<T>,
    options?: PutOptions,
  ): Promise<SettingsEnvelope<T>> {
    const expectedRevision = options?.force ? undefined : options?.expectedRevision;

    if (expectedRevision !== undefined) {
      const currentRevision = this.documents.get(doc.key)?.revision;
      if (currentRevision !== expectedRevision) {
        throw new ConflictError(doc.key);
      }
    }

    const counter = (this.revCounters.get(doc.key) ?? 0) + 1;
    this.revCounters.set(doc.key, counter);

    const stored: SettingsEnvelope<T> = { ...doc, revision: `rev-${counter}` };
    this.documents.set(doc.key, stored);
    return stored;
  }

  async deleteDocument(key: string): Promise<void> {
    this.documents.delete(key);
  }

  async listDocuments(): Promise<SettingsSummary[]> {
    return Array.from(this.documents.values()).map((doc) => ({
      key: doc.key,
      updatedAt: doc.updatedAt,
      revision: doc.revision,
    }));
  }

  /** Direct-provider write used to simulate an interleaved remote writer. */
  public async simulateRemoteWrite<T>(key: string, data: T): Promise<SettingsEnvelope<T>> {
    return this.putDocument({ key, schemaVersion: 1, updatedAt: new Date().toISOString(), data });
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
          { expectedRevision: 'rev-abc' },
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
          ]),
        );
      });
    });
  });
});

describe('DefaultSettingsStore — optimistic-by-default concurrency (D2)', () => {
  let store: DefaultSettingsStore;
  let provider: ConcurrencyEnforcingProvider;

  beforeEach(async () => {
    provider = new ConcurrencyEnforcingProvider();

    const registry = new Map<ProviderId, ProviderDescriptor>();
    registry.set('local', {
      id: 'local',
      label: 'Local',
      capabilities: [],
      isSupported: async () => true,
      create: () => provider,
    });

    store = new DefaultSettingsStore(registry);
    await store.connect('local');
  });

  function snapshotRevisions(): Map<string, string | undefined> {
    const snapshot = new Map<string, string | undefined>();
    for (const [key, doc] of provider.documents) {
      snapshot.set(key, doc.revision);
    }
    return snapshot;
  }

  // bypass: fast-check not installed; deterministic interleaving case matrix
  // (stale-read write, force overwrite, missing-key conditional, interleaved puts)
  // with state-delta assertions over the document store universe. The read
  // gate parks the manager's internal read so a remote writer deterministically
  // lands between the read and the write.
  describe('interleaved writer case matrix', () => {
    function armReadGate(): () => void {
      let release!: () => void;
      provider.readGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        provider.readGate = null;
        release();
      };
    }

    it('default write after a read rejects with ConflictError when the remote revision advanced', async () => {
      await store.put('doc', { v: 1 });
      const releaseRead = armReadGate();

      const inFlight = store.put('doc', { v: 2 }); // manager read parks on the gate
      await provider.simulateRemoteWrite('doc', { v: 'remote' }); // interleaved writer advances
      releaseRead();

      await expect(inFlight).rejects.toThrow(ConflictError);

      // state delta: the remote writer's update was not lost to a silent overwrite
      const survivor = await store.get<{ v: string | number }>('doc');
      expect(survivor!.data).toEqual({ v: 'remote' });
    });

    it('interleaved writes never lose updates: the losing writer re-reads and re-applies', async () => {
      await store.put('doc', { v: 1 });
      const releaseRead = armReadGate();

      const inFlight = store.put('doc', { v: 2 });
      await provider.simulateRemoteWrite('doc', { v: 'remote' });
      releaseRead();

      await expect(inFlight).rejects.toThrow(ConflictError);

      // loser reconciles: fresh read observes the advanced revision, then writes on top of it
      const current = await store.get<{ v: string | number }>('doc');
      const reconciled = await store.put(
        'doc',
        { v: `${current!.data.v}+local` },
        { expectedRevision: current!.revision },
      );

      expect(reconciled.data).toEqual({ v: 'remote+local' });
      const finalDoc = provider.documents.get('doc');
      expect(finalDoc!.revision).toBe(reconciled.revision);
    });

    it('explicit force opt-out overwrites despite a concurrent remote change', async () => {
      await store.put('doc', { v: 1 });
      const releaseRead = armReadGate();

      const inFlight = store.put('doc', { v: 2 }, { force: true });
      await provider.simulateRemoteWrite('doc', { v: 'remote' });
      releaseRead();

      const forced = await inFlight;

      expect(forced.data).toEqual({ v: 2 });
      const survivor = await store.get<{ v: number }>('doc');
      expect(survivor!.data).toEqual({ v: 2 });
    });

    it('first write to a key with no existing document succeeds without an expectation', async () => {
      const before = snapshotRevisions();
      const created = await store.put('fresh', { v: 1 });

      expect(created.revision).toBeDefined();
      expect(before.has('fresh')).toBe(false);
    });

    it('explicit expectedRevision against a non-existent key rejects with ConflictError (uniform rule)', async () => {
      await expect(
        store.put('never-written', { v: 1 }, { expectedRevision: 'revision-of-a-ghost' }),
      ).rejects.toThrow(ConflictError);
      expect(provider.documents.has('never-written')).toBe(false);
    });

    it('default write after a read succeeds when the remote revision did not advance', async () => {
      await store.put('doc', { v: 1 });

      const updated = await store.put('doc', { v: 2 });

      expect(updated.data).toEqual({ v: 2 });
      const stored = await store.get<{ v: number }>('doc');
      expect(stored!.data).toEqual({ v: 2 });
    });

    it('adjacent keys are untouched by a conflicting write (state-delta universe)', async () => {
      await store.put('bystander', { keep: true });
      await store.put('doc', { v: 1 });
      const before = snapshotRevisions();

      const releaseRead = armReadGate();
      const inFlight = store.put('doc', { v: 2 });
      await provider.simulateRemoteWrite('doc', { v: 'remote' });
      releaseRead();
      await expect(inFlight).rejects.toThrow(ConflictError);

      const after = snapshotRevisions();
      expect(after.get('bystander')).toBe(before.get('bystander'));
      expect(after.get('doc')).not.toBe(before.get('doc'));
    });
  });
});
