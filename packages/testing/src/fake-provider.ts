import type {
  DocumentStoreProvider,
  ProviderId,
  SettingsEnvelope,
  SettingsSummary,
  ConnectedProfile,
  PutOptions,
} from '@storage-bridge/core';
import { ConflictError, NotConnectedError } from '@storage-bridge/core';

/**
 * In-memory DocumentStoreProvider for testing.
 * Supports revision tracking and conflict detection via expectedRevision.
 */
export class FakeDocumentStoreProvider implements DocumentStoreProvider {
  readonly id: ProviderId = 'local';
  private store = new Map<string, SettingsEnvelope<unknown>>();
  private revCounters = new Map<string, number>();
  private connected = false;
  private profile: ConnectedProfile | null = null;

  async connect(): Promise<void> {
    this.connected = true;
    this.profile = { provider: this.id };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.profile = null;
  }

  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  async getProfile(): Promise<ConnectedProfile | null> {
    return this.profile;
  }

  /** Uniform pre-connect policy (02-06), mirroring the real providers. */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new NotConnectedError();
    }
  }

  async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    this.ensureConnected();
    const entry = this.store.get(key);
    if (!entry) return null;
    return entry as SettingsEnvelope<T>;
  }

  async putDocument<T>(doc: SettingsEnvelope<T>, options?: PutOptions): Promise<SettingsEnvelope<T>> {
    this.ensureConnected();
    const existing = this.store.get(doc.key);

    // D2 semantics mirrored from the real providers: an expectation rejects
    // on mismatch or missing key (uniform rule); force skips the check.
    const expectedRevision = options?.force ? undefined : options?.expectedRevision;
    if (expectedRevision !== undefined && existing?.revision !== expectedRevision) {
      throw new ConflictError(doc.key);
    }

    const counter = (this.revCounters.get(doc.key) ?? 0) + 1;
    this.revCounters.set(doc.key, counter);

    const envelope: SettingsEnvelope<T> = {
      key: doc.key,
      schemaVersion: doc.schemaVersion,
      updatedAt: doc.updatedAt || new Date().toISOString(),
      revision: `rev-${counter}`,
      data: doc.data,
    };

    this.store.set(doc.key, envelope as SettingsEnvelope<unknown>);
    return envelope;
  }

  async deleteDocument(key: string): Promise<void> {
    this.ensureConnected();
    this.store.delete(key);
  }

  async listDocuments(): Promise<SettingsSummary[]> {
    this.ensureConnected();
    return Array.from(this.store.values()).map(entry => ({
      key: entry.key,
      updatedAt: entry.updatedAt,
      revision: entry.revision,
    }));
  }
}
