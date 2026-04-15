import type { OAuthClient } from '@storage-bridge/auth-web';
import {
  FileBackedDocumentProvider,
  type FileEntry,
  type PutOptions,
  ConflictError,
  AuthRequiredError,
  SettingsStoreError,
} from '@storage-bridge/core';
import { toFileEntry, type GoogleDriveFileRaw } from './google-drive-mapper.js';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';

export interface GoogleDriveProviderOptions {
  auth: OAuthClient;
  fetchFn?: typeof fetch;
}

export class GoogleDriveProvider extends FileBackedDocumentProvider {
  readonly id = 'google-drive' as const;

  private readonly auth: OAuthClient;
  private readonly fetchFn: typeof fetch;

  constructor(options: GoogleDriveProviderOptions) {
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
    return { provider: 'google-drive' as const };
  }

  public async readFile(fileName: string): Promise<{ text: string; meta: FileEntry } | null> {
    const file = await this.findFileByName(fileName);
    if (!file) return null;

    const res = await this.fetchFn(`${DRIVE_API_BASE}/${file.id}?alt=media`, {
      headers: await this.auth.getAuthHeaders(),
    });

    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
    if (!res.ok) throw new SettingsStoreError(`Drive read failed: ${res.status}`, 'DRIVE_READ_ERROR');

    return { text: await res.text(), meta: file };
  }

  public async writeFile(fileName: string, body: string, options?: PutOptions): Promise<FileEntry> {
    const existing = await this.findFileByName(fileName);

    if (options?.expectedRevision !== undefined) {
      if (!existing || existing.revision !== options.expectedRevision) {
        throw new ConflictError(fileName);
      }
    }

    return existing
      ? this.updateFile(existing.id, body)
      : this.createFile(fileName, body);
  }

  public async removeFile(fileName: string): Promise<void> {
    const file = await this.findFileByName(fileName);
    if (!file) return;

    const res = await this.fetchFn(`${DRIVE_API_BASE}/${file.id}`, {
      method: 'DELETE',
      headers: await this.auth.getAuthHeaders(),
    });

    if (res.status === 404) return;
    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
    if (!res.ok) throw new SettingsStoreError(`Drive delete failed: ${res.status}`, 'DRIVE_DELETE_ERROR');
  }

  public async listFiles(): Promise<FileEntry[]> {
    const res = await this.fetchFn(
      `${DRIVE_API_BASE}?spaces=appDataFolder&fields=files(id,name,mimeType,size,modifiedTime,version)`,
      { headers: await this.auth.getAuthHeaders() },
    );

    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
    if (!res.ok) throw new SettingsStoreError(`Drive list failed: ${res.status}`, 'DRIVE_LIST_ERROR');

    const json = await res.json() as { files?: GoogleDriveFileRaw[] };
    return (json.files ?? []).map(f => toFileEntry(f, (name) => this.fileNameToKey(name)));
  }

  private async findFileByName(name: string): Promise<FileEntry | null> {
    const query = encodeURIComponent(`name='${name}' and trashed=false`);
    const res = await this.fetchFn(
      `${DRIVE_API_BASE}?spaces=appDataFolder&q=${query}&fields=files(id,name,mimeType,size,modifiedTime,version)`,
      { headers: await this.auth.getAuthHeaders() },
    );
    if (!res.ok) return null;

    const json = await res.json() as { files?: GoogleDriveFileRaw[] };
    const files = json.files ?? [];
    return files.length > 0 ? toFileEntry(files[0], (n) => this.fileNameToKey(n)) : null;
  }

  private async createFile(name: string, body: string): Promise<FileEntry> {
    const metadata = { name, parents: ['appDataFolder'] };
    const boundary = 'storage-bridge-boundary';
    const payload =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;

    const res = await this.fetchFn(
      `${DRIVE_UPLOAD_BASE}?uploadType=multipart&fields=id,name,modifiedTime,version,size`,
      {
        method: 'POST',
        headers: {
          ...(await this.auth.getAuthHeaders()),
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: payload,
      },
    );

    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
    if (!res.ok) throw new SettingsStoreError(`Drive create failed: ${res.status}`, 'DRIVE_CREATE_ERROR');

    return toFileEntry(await res.json() as GoogleDriveFileRaw, (n) => this.fileNameToKey(n));
  }

  private async updateFile(id: string, body: string): Promise<FileEntry> {
    const res = await this.fetchFn(
      `${DRIVE_UPLOAD_BASE}/${id}?uploadType=media&fields=id,name,modifiedTime,version,size`,
      {
        method: 'PATCH',
        headers: {
          ...(await this.auth.getAuthHeaders()),
          'Content-Type': 'application/json',
        },
        body,
      },
    );

    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
    if (!res.ok) throw new SettingsStoreError(`Drive update failed: ${res.status}`, 'DRIVE_UPDATE_ERROR');

    return toFileEntry(await res.json() as GoogleDriveFileRaw, (n) => this.fileNameToKey(n));
  }
}
