import {
  ProviderId,
  SettingsEnvelope,
  SettingsSummary,
  ConnectedProfile,
  PutOptions,
  DocumentStoreProvider,
} from '../types.js';
import { ConflictError, NotConnectedError } from '../errors.js';

export class LocalDocumentStoreProvider implements DocumentStoreProvider {
  readonly id: ProviderId = 'local';

  private store = new Map<string, SettingsEnvelope<unknown>>();
  private revisionCounters = new Map<string, number>();
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    // Local-provider spec: disconnect clears only the connection flag — the
    // store persists across disconnect/reconnect within the same instance.
    this.connected = false;
  }

  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  async getProfile(): Promise<ConnectedProfile | null> {
    if (!this.connected) {
      return null;
    }
    return { provider: 'local', accountId: 'local' };
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new NotConnectedError();
    }
  }

  async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    this.ensureConnected();
    const doc = this.store.get(key);
    return doc ? (doc as SettingsEnvelope<T>) : null;
  }

  async putDocument<T>(
    doc: SettingsEnvelope<T>,
    options?: PutOptions
  ): Promise<SettingsEnvelope<T>> {
    this.ensureConnected();

    const existing = this.store.get(doc.key);

    // D2 semantics (02-02), mirrored from the shared contract fake: an
    // expectation rejects on mismatch or missing key (uniform rule); force
    // skips the check entirely.
    const expectedRevision = options?.force ? undefined : options?.expectedRevision;
    if (expectedRevision !== undefined && existing?.revision !== expectedRevision) {
      throw new ConflictError(doc.key);
    }

    const currentCounter = this.revisionCounters.get(doc.key) ?? 0;
    const nextCounter = currentCounter + 1;
    this.revisionCounters.set(doc.key, nextCounter);

    const revision = `rev-${nextCounter}`;
    const updatedDoc: SettingsEnvelope<T> = {
      ...doc,
      revision,
      updatedAt: new Date().toISOString(),
    };

    this.store.set(doc.key, updatedDoc);
    return updatedDoc;
  }

  async deleteDocument(key: string): Promise<void> {
    this.ensureConnected();
    this.store.delete(key);
  }

  async listDocuments(): Promise<SettingsSummary[]> {
    this.ensureConnected();
    const summaries: SettingsSummary[] = [];
    for (const doc of this.store.values()) {
      summaries.push({
        key: doc.key,
        updatedAt: doc.updatedAt,
        revision: doc.revision,
      });
    }
    return summaries;
  }
}
