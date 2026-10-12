import { ConflictError, NotConnectedError } from '../errors.js';
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

  /**
   * Uniform pre-connect policy (02-06): every data operation rejects with
   * NotConnectedError before connect(), based on the provider's honest
   * isConnected() answer — never with a fabricated success or a raw
   * transport error.
   */
  private async ensureConnected(): Promise<void> {
    if (!(await this.isConnected())) {
      throw new NotConnectedError();
    }
  }

  async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    await this.ensureConnected();
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

  async putDocument<T>(
    doc: SettingsEnvelope<T>,
    options?: PutOptions,
  ): Promise<SettingsEnvelope<T>> {
    await this.ensureConnected();
    // D2: the changeTag precondition comes ONLY from explicit caller
    // expectations — never from the document's own revision, which caused
    // spurious conflicts on plain puts. `force` opts out entirely.
    const expectedRevision = options?.force ? undefined : options?.expectedRevision;

    if (expectedRevision !== undefined) {
      // Uniform conflict rule (D2): an expectation against a key that does
      // not exist — or whose changeTag advanced — rejects with ConflictError.
      const existing = await this.getRecord(doc.key);
      if (!existing || existing.changeTag !== expectedRevision) {
        throw new ConflictError(doc.key);
      }
    }

    const now = new Date().toISOString();
    const saved = await this.saveRecord(
      {
        recordName: doc.key,
        changeTag: expectedRevision,
        fields: {
          key: doc.key,
          schemaVersion: doc.schemaVersion,
          updatedAt: now,
          data: doc.data,
        },
      },
      options,
    );

    return {
      key: doc.key,
      schemaVersion: Number(saved.fields.schemaVersion ?? doc.schemaVersion),
      updatedAt: String(saved.fields.updatedAt ?? now),
      revision: saved.changeTag,
      data: saved.fields.data as T,
    };
  }

  async deleteDocument(key: string): Promise<void> {
    await this.ensureConnected();
    await this.removeRecord(key);
  }

  async listDocuments(): Promise<SettingsSummary[]> {
    await this.ensureConnected();
    const records = await this.listRecords();
    return records.map((r) => ({
      key: r.recordName,
      updatedAt: String(r.fields.updatedAt ?? r.modifiedAt ?? new Date(0).toISOString()),
      revision: r.changeTag,
    }));
  }
}
