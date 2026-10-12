import type { OAuthClient } from '@storage-bridge/core';
import {
  FileBackedDocumentProvider,
  type FileEntry,
  type PutOptions,
  ConflictError,
  AuthRequiredError,
  SettingsStoreError,
} from '@storage-bridge/core';
import { toFileEntry, type DropboxFileRaw } from './dropbox-mapper.js';

const CONTENT_BASE = 'https://content.dropboxapi.com';
const API_BASE = 'https://api.dropboxapi.com';

export interface DropboxProviderOptions {
  auth: OAuthClient;
  fetchFn?: typeof fetch;
}

export class DropboxProvider extends FileBackedDocumentProvider {
  readonly id = 'dropbox' as const;

  private readonly auth: OAuthClient;
  private readonly fetchFn: typeof fetch;
  /**
   * Minimal connection flag (02-06 uniform pre-connect policy): data ops
   * before connect() reject NotConnectedError instead of leaking a raw 401.
   * Lifecycle truth (token-derived state) is step 02-08's concern.
   */
  private connected = false;

  constructor(options: DropboxProviderOptions) {
    super();
    this.auth = options.auth;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async connect(): Promise<void> {
    await this.auth.login();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.auth.logout();
    this.connected = false;
  }

  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  async getProfile() {
    const tokens = await this.auth.getTokens();
    if (!tokens) return null;
    return { provider: this.id };
  }

  public async readFile(fileName: string): Promise<{ text: string; meta: FileEntry } | null> {
    const res = await this.fetchFn(`${CONTENT_BASE}/2/files/download`, {
      method: 'POST',
      headers: {
        ...(await this.auth.getAuthHeaders()),
        'Dropbox-API-Arg': JSON.stringify({ path: `/${fileName}` }),
      },
    });

    if (res.status === 409) return null;
    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
    if (!res.ok) throw new SettingsStoreError(`Dropbox read failed: ${res.status}`, 'DROPBOX_READ_ERROR');

    const metaHeader = res.headers.get('Dropbox-API-Result') ?? '{}';

    // Remote metadata headers are untrusted input: a non-JSON or wrong-shape
    // header rejects with a coded SettingsStoreError chaining the underlying
    // failure — a raw SyntaxError never escapes the provider boundary (02-06).
    let raw: DropboxFileRaw;
    try {
      const parsed: unknown = JSON.parse(metaHeader);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`Parsed metadata is ${parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed} instead of an object`);
      }
      raw = parsed as DropboxFileRaw;
    } catch (error) {
      throw new SettingsStoreError(
        'Dropbox read returned a corrupt metadata header',
        'DROPBOX_META_CORRUPT',
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    return { text: await res.text(), meta: toFileEntry(raw, (n) => this.fileNameToKey(n)) };
  }

  public async writeFile(fileName: string, body: string, options?: PutOptions): Promise<FileEntry> {
    const mode = resolveUploadMode(options);

    const res = await this.fetchFn(`${CONTENT_BASE}/2/files/upload`, {
      method: 'POST',
      headers: {
        ...(await this.auth.getAuthHeaders()),
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: `/${fileName}`, mode, mute: true }),
      },
      body,
    });

    // Payload is the caller's logical key, never the encoded remote name.
    if (res.status === 409) throw new ConflictError(this.fileNameToKey(fileName));
    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
    if (!res.ok) throw new SettingsStoreError(`Dropbox write failed: ${res.status}`, 'DROPBOX_WRITE_ERROR');

    return toFileEntry(await res.json() as DropboxFileRaw, (n) => this.fileNameToKey(n));
  }

  public async removeFile(fileName: string): Promise<void> {
    const res = await this.fetchFn(`${API_BASE}/2/files/delete_v2`, {
      method: 'POST',
      headers: {
        ...(await this.auth.getAuthHeaders()),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: `/${fileName}` }),
    });

    if (res.status === 409) return;
    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
    if (!res.ok) throw new SettingsStoreError(`Dropbox delete failed: ${res.status}`, 'DROPBOX_DELETE_ERROR');
  }

  public async listFiles(): Promise<FileEntry[]> {
    const entries: FileEntry[] = [];
    let cursor: string | undefined;

    // Full pagination: list_folder answers with has_more/cursor; continue via
    // list_folder/continue until has_more is false so large listings are never
    // silently truncated (a truncated listing is what historically fed the
    // duplicate-create corruption path).
    do {
      const res = await this.fetchFn(
        cursor === undefined ? `${API_BASE}/2/files/list_folder` : `${API_BASE}/2/files/list_folder/continue`,
        {
          method: 'POST',
          headers: {
            ...(await this.auth.getAuthHeaders()),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(cursor === undefined ? { path: '' } : { cursor }),
        },
      );

      if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
      if (!res.ok) throw new SettingsStoreError(`Dropbox list failed: ${res.status}`, 'DROPBOX_LIST_ERROR');

      const json = await res.json() as { entries?: DropboxFileRaw[]; has_more?: boolean; cursor?: string };
      entries.push(
        ...(json.entries ?? [])
          .filter(e => e['.tag'] === 'file')
          .map(e => toFileEntry(e, (n) => this.fileNameToKey(n))),
      );
      cursor = json.has_more === true && typeof json.cursor === 'string' ? json.cursor : undefined;
    } while (cursor !== undefined);

    return entries;
  }
}

/**
 * D2 conditional writes: Dropbox's update mode is the server-side revision
 * precondition — the upload succeeds only while the stored revision still
 * equals the revision read before the write, so interleaved writers are
 * detected atomically (409 → ConflictError). `force` opts out into a blind
 * overwrite (last-writer-wins); a write without any expectation is LWW too.
 */
function resolveUploadMode(options?: PutOptions): string | { '.tag': 'update'; update: string } {
  if (!options?.force && options?.expectedRevision !== undefined) {
    return { '.tag': 'update', update: options.expectedRevision };
  }
  return 'overwrite';
}