import type {
  DocumentStoreProvider,
  ProviderId,
  SettingsEnvelope,
  SettingsSummary,
  ConnectedProfile,
  PutOptions,
} from '@storage-bridge/core';
import { ConflictError } from '@storage-bridge/core';

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

  async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    return entry as SettingsEnvelope<T>;
  }

  async putDocument<T>(doc: SettingsEnvelope<T>, options?: PutOptions): Promise<SettingsEnvelope<T>> {
    const existing = this.store.get(doc.key);

    if (options?.expectedRevision !== undefined) {
      const currentRev = existing?.revision;
      if (currentRev !== options.expectedRevision) {
        throw new ConflictError(doc.key);
      }
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
    this.store.delete(key);
  }

  async listDocuments(): Promise<SettingsSummary[]> {
    return Array.from(this.store.values()).map(entry => ({
      key: entry.key,
      updatedAt: entry.updatedAt,
      revision: entry.revision,
    }));
  }
}
