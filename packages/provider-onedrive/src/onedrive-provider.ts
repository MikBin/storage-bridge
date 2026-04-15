import type { OAuthClient } from '@storage-bridge/auth-web';
import {
  FileBackedDocumentProvider,
  type FileEntry,
  type PutOptions,
  ConflictError,
  AuthRequiredError,
  SettingsStoreError,
} from '@storage-bridge/core';
import { toFileEntry, type OneDriveItemRaw } from './onedrive-mapper.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';

export interface OneDriveProviderOptions {
  auth: OAuthClient;
  fetchFn?: typeof fetch;
}

export class OneDriveProvider extends FileBackedDocumentProvider {
  readonly id = 'onedrive' as const;

  private readonly auth: OAuthClient;
  private readonly fetchFn: typeof fetch;

  constructor(options: OneDriveProviderOptions) {
    super();
    this.auth = options.auth;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async connect(): Promise<void> {
    await this.auth.login();
  }

  async disconnect(): Promise<void> {
    await this.auth.logout();
  }

  async isConnected(): Promise<boolean> {
    return !!(await this.auth.getTokens());
  }

  async getProfile() {
    const tokens = await this.auth.getTokens();
    if (!tokens) return null;
    return { provider: this.id };
  }

  protected async readFile(fileName: string): Promise<{ text: string; meta: FileEntry } | null> {
    const res = await this.fetchFn(`${GRAPH_BASE}:/${fileName}:/content`, {
      headers: await this.auth.getAuthHeaders(),
    });

    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
    if (!res.ok) throw new SettingsStoreError(`OneDrive read failed: ${res.status}`, 'ONEDRIVE_READ_ERROR');

    const meta = await this.getItemMetadata(fileName);
    return { text: await res.text(), meta };
  }

  protected async writeFile(fileName: string, body: string, options?: PutOptions): Promise<FileEntry> {
    const headers: Record<string, string> = {
      ...(await this.auth.getAuthHeaders()),
      'Content-Type': 'application/json',
    };

    if (options?.expectedRevision !== undefined) {
      headers['If-Match'] = options.expectedRevision;
    }

    const res = await this.fetchFn(`${GRAPH_BASE}:/${fileName}:/content`, {
      method: 'PUT',
      headers,
      body,
    });

    if (res.status === 412) throw new ConflictError(fileName);
    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
    if (!res.ok) throw new SettingsStoreError(`OneDrive write failed: ${res.status}`, 'ONEDRIVE_WRITE_ERROR');

    return toFileEntry(await res.json() as OneDriveItemRaw, (n) => this.fileNameToKey(n));
  }

  protected async removeFile(fileName: string): Promise<void> {
    const res = await this.fetchFn(`${GRAPH_BASE}:/${fileName}`, {
      method: 'DELETE',
      headers: await this.auth.getAuthHeaders(),
    });

    if (res.status === 404) return;
    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
    if (!res.ok) throw new SettingsStoreError(`OneDrive delete failed: ${res.status}`, 'ONEDRIVE_DELETE_ERROR');
  }

  protected async listFiles(): Promise<FileEntry[]> {
    const res = await this.fetchFn(`${GRAPH_BASE}/children`, {
      headers: await this.auth.getAuthHeaders(),
    });

    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
    if (!res.ok) throw new SettingsStoreError(`OneDrive list failed: ${res.status}`, 'ONEDRIVE_LIST_ERROR');

    const json = await res.json() as { value?: OneDriveItemRaw[] };
    return (json.value ?? []).map(v => toFileEntry(v, (n) => this.fileNameToKey(n)));
  }

  private async getItemMetadata(fileName: string): Promise<FileEntry> {
    const res = await this.fetchFn(`${GRAPH_BASE}:/${fileName}`, {
      headers: await this.auth.getAuthHeaders(),
    });

    if (!res.ok) throw new SettingsStoreError(`OneDrive metadata failed: ${res.status}`, 'ONEDRIVE_META_ERROR');
    return toFileEntry(await res.json() as OneDriveItemRaw, (n) => this.fileNameToKey(n));
  }
}
