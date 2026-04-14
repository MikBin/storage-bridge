import { describe, it, expect, beforeEach } from 'vitest';
import { createSettingsStore } from '../registry.js';
import { ConflictError } from '../errors.js';
import type {
  ConnectedProfile,
  DocumentStoreProvider,
  ProviderDescriptor,
  ProviderId,
  PutOptions,
  SettingsEnvelope,
  SettingsStore,
  SettingsSummary,
} from '../types.js';

class FakeIntegrationProvider implements DocumentStoreProvider {
  public readonly id: ProviderId = 'local';
  private connected = false;
  private documents = new Map<string, SettingsEnvelope<any>>();
  private revisionCounters = new Map<string, number>();

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
    if (!this.connected) return null;
    return { provider: this.id };
  }

  async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    const doc = this.documents.get(key);
    return (doc as SettingsEnvelope<T>) ?? null;
  }

  async putDocument<T>(
    doc: SettingsEnvelope<T>,
    options?: PutOptions
  ): Promise<SettingsEnvelope<T>> {
    const existing = this.documents.get(doc.key);

    if (options?.expectedRevision !== undefined) {
      if (existing?.revision !== options.expectedRevision) {
        throw new ConflictError(doc.key);
      }
    }

    const counter = (this.revisionCounters.get(doc.key) ?? 0) + 1;
    this.revisionCounters.set(doc.key, counter);

    const newDoc: SettingsEnvelope<T> = {
      ...doc,
      revision: `rev-${counter}`,
      updatedAt: new Date().toISOString(),
    };

    this.documents.set(doc.key, newDoc);
    return newDoc;
  }

  async deleteDocument(key: string): Promise<void> {
    this.documents.delete(key);
  }

  async listDocuments(): Promise<SettingsSummary[]> {
    return Array.from(this.documents.values()).map(doc => ({
      key: doc.key,
      updatedAt: doc.updatedAt,
      revision: doc.revision,
    }));
  }
}

describe('Core Integration Tests', () => {
  let store: SettingsStore;
  let fakeProvider: FakeIntegrationProvider;

  beforeEach(() => {
    fakeProvider = new FakeIntegrationProvider();

    const descriptor: ProviderDescriptor = {
      id: 'local',
      label: 'Fake Local',
      capabilities: [],
      isSupported: async () => true,
      create: () => fakeProvider,
    };

    store = createSettingsStore([descriptor]);
  });

  it('1. Integration test: register fake provider, connect, put/get/list/delete, disconnect', async () => {
    // connect
    await store.connect('local');
    expect(await store.isConnected()).toBe(true);

    // put
    const docData = { testing: true, value: 42 };
    const putResult = await store.put('test-doc', docData);
    expect(putResult.key).toBe('test-doc');
    expect(putResult.data).toEqual(docData);
    expect(putResult.revision).toBe('rev-1');

    // get
    const getResult = await store.get<{ testing: boolean; value: number }>('test-doc');
    expect(getResult).not.toBeNull();
    expect(getResult?.data).toEqual(docData);
    expect(getResult?.revision).toBe('rev-1');

    // list
    const listResult = await store.list();
    expect(listResult).toHaveLength(1);
    expect(listResult[0].key).toBe('test-doc');
    expect(listResult[0].revision).toBe('rev-1');

    // delete
    await store.delete('test-doc');
    const getDeleted = await store.get('test-doc');
    expect(getDeleted).toBeNull();
    const listAfterDelete = await store.list();
    expect(listAfterDelete).toHaveLength(0);

    // disconnect
    await store.disconnect();
    expect(await store.isConnected()).toBe(false);
  });

  it('2. Optimistic concurrency: put with expectedRevision triggers ConflictError on mismatch', async () => {
    await store.connect('local');

    // Initial put
    const result1 = await store.put('concurrent-doc', { step: 1 });
    expect(result1.revision).toBe('rev-1');

    // Put with correct expectedRevision
    const result2 = await store.put('concurrent-doc', { step: 2 }, { expectedRevision: 'rev-1' });
    expect(result2.revision).toBe('rev-2');

    // Put with incorrect expectedRevision
    await expect(
      store.put('concurrent-doc', { step: 3 }, { expectedRevision: 'rev-1' })
    ).rejects.toThrow(ConflictError);

    // Put for a new doc with an expectedRevision should also fail
    await expect(
      store.put('new-doc', { step: 1 }, { expectedRevision: 'rev-anything' })
    ).rejects.toThrow(ConflictError);
  });

  it('3. schemaVersion preservation across put/get cycles', async () => {
    await store.connect('local');

    // First put should set schemaVersion to 1
    const result1 = await store.put('schema-doc', { text: 'v1' });
    expect(result1.schemaVersion).toBe(1);

    // Simulate an external provider process that updates schemaVersion behind the scenes
    // For example, reading an older format and updating it.
    // To do this, we can manipulate the fakeProvider directly.
    await fakeProvider.putDocument({
      key: 'schema-doc',
      schemaVersion: 3,
      updatedAt: new Date().toISOString(),
      data: { text: 'v3' }
    });

    // Now get the document, it should have schemaVersion 3
    const getResult = await store.get<{ text: string }>('schema-doc');
    expect(getResult?.schemaVersion).toBe(3);

    // Now put again through the store.
    // Store should read the existing schemaVersion (3) and preserve it.
    const result2 = await store.put('schema-doc', { text: 'v3-updated' });
    expect(result2.schemaVersion).toBe(3);
    expect(result2.data).toEqual({ text: 'v3-updated' });
  });
});
