import type {
  DocumentStoreProvider,
  ProviderId,
  PutOptions,
  SettingsEnvelope,
  SettingsSummary,
  ConnectedProfile,
} from '../types.js';

export interface CloudRecord {
  recordName: string;
  modifiedAt?: string;
  changeTag?: string;
  fields: Record<string, unknown>;
}

export abstract class RecordBackedDocumentProvider implements DocumentStoreProvider {
  abstract readonly id: ProviderId;

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): Promise<boolean>;
  abstract getProfile(): Promise<ConnectedProfile | null>;

  protected abstract getRecord(key: string): Promise<CloudRecord | null>;
  protected abstract saveRecord(record: CloudRecord, options?: PutOptions): Promise<CloudRecord>;
  protected abstract removeRecord(key: string): Promise<void>;
  protected abstract listRecords(): Promise<CloudRecord[]>;

  async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    const record = await this.getRecord(key);
    if (!record) return null;
    return {
      key,
      schemaVersion: Number(record.fields.schemaVersion ?? 1),
      updatedAt: String(record.fields.updatedAt ?? record.modifiedAt ?? new Date(0).toISOString()),
      revision: record.changeTag,
      data: record.fields.data as T,
    };
  }

  async putDocument<T>(doc: SettingsEnvelope<T>, options?: PutOptions): Promise<SettingsEnvelope<T>> {
    const now = new Date().toISOString();
    const saved = await this.saveRecord({
      recordName: doc.key,
      changeTag: doc.revision,
      fields: {
        key: doc.key,
        schemaVersion: doc.schemaVersion,
        updatedAt: now,
        data: doc.data,
      },
    }, options);

    return {
      key: doc.key,
      schemaVersion: Number(saved.fields.schemaVersion ?? doc.schemaVersion),
      updatedAt: String(saved.fields.updatedAt ?? now),
      revision: saved.changeTag,
      data: saved.fields.data as T,
    };
  }

  async deleteDocument(key: string): Promise<void> {
    await this.removeRecord(key);
  }

  async listDocuments(): Promise<SettingsSummary[]> {
    const records = await this.listRecords();
    return records.map(r => ({
      key: r.recordName,
      updatedAt: String(r.fields.updatedAt ?? r.modifiedAt ?? new Date(0).toISOString()),
      revision: r.changeTag,
    }));
  }
}
