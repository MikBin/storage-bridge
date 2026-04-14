import type {
  DocumentStoreProvider,
  ProviderId,
  PutOptions,
  SettingsEnvelope,
  SettingsSummary,
  ConnectedProfile,
} from '../types.js';

export interface FileEntry {
  id: string;
  logicalKey: string;
  name: string;
  updatedAt?: string;
  revision?: string;
  size?: number;
}

export abstract class FileBackedDocumentProvider implements DocumentStoreProvider {
  abstract readonly id: ProviderId;

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): Promise<boolean>;
  abstract getProfile(): Promise<ConnectedProfile | null>;

  protected abstract readFile(fileName: string): Promise<{ text: string; meta: FileEntry } | null>;
  protected abstract writeFile(fileName: string, body: string, options?: PutOptions): Promise<FileEntry>;
  protected abstract removeFile(fileName: string): Promise<void>;
  protected abstract listFiles(): Promise<FileEntry[]>;

  protected keyToFileName(key: string): string {
    return `${encodeURIComponent(key)}.json`;
  }

  protected fileNameToKey(fileName: string): string {
    return decodeURIComponent(fileName.replace(/\.json$/, ''));
  }

  async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    const file = await this.readFile(this.keyToFileName(key));
    if (!file) return null;
    const parsed = JSON.parse(file.text) as SettingsEnvelope<T>;
    return { ...parsed, key, revision: file.meta.revision ?? parsed.revision };
  }

  async putDocument<T>(doc: SettingsEnvelope<T>, options?: PutOptions): Promise<SettingsEnvelope<T>> {
    const now = new Date().toISOString();
    const payload = JSON.stringify({ ...doc, updatedAt: now });
    const meta = await this.writeFile(this.keyToFileName(doc.key), payload, options);
    return { ...doc, updatedAt: meta.updatedAt ?? now, revision: meta.revision };
  }

  async deleteDocument(key: string): Promise<void> {
    await this.removeFile(this.keyToFileName(key));
  }

  async listDocuments(): Promise<SettingsSummary[]> {
    const files = await this.listFiles();
    return files.map(f => ({
      key: f.logicalKey,
      updatedAt: f.updatedAt ?? new Date(0).toISOString(),
      revision: f.revision,
    }));
  }
}
