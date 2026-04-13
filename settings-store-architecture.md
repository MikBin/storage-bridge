# Cross-provider settings store architecture

This draft is for a client-side TypeScript library that stores per-user app settings in the user's own cloud account with a transparent API across Google Drive, Dropbox, OneDrive, and iCloud.

## Why the abstraction should be document-oriented

A filesystem abstraction is tempting, but the providers do not line up cleanly. Google Drive offers a hidden `appDataFolder` for app-specific files, OneDrive offers an app folder through `/special/approot` with `Files.ReadWrite.AppFolder`, and both are explicitly positioned for configuration and settings-style storage [web:28][page:1]. Apple iCloud support is typically exposed through CloudKit, which is closer to a private record/document store than a normal user-visible app folder [page:2].

Because of that, the most stable cross-provider contract is a keyed JSON document store rather than a generic file manager [web:28][page:1][page:2].

## Design goals

- Consumer code never deals with provider-specific APIs.
- Providers can be added later without changing the consumer API.
- Least-privilege storage is preferred where the provider supports it.
- Browser, hybrid, and React Native can share the same core package.
- Provider-specific auth and runtime constraints stay isolated.

## Recommended public API

```ts
export type ProviderId =
  | 'google-drive'
  | 'dropbox'
  | 'onedrive'
  | 'icloud'
  | 'local';

export type Revision = string;

export interface SettingsEnvelope<T> {
  key: string;
  schemaVersion: number;
  updatedAt: string;
  revision?: Revision;
  data: T;
}

export interface SettingsSummary {
  key: string;
  updatedAt: string;
  revision?: Revision;
}

export interface ConnectedProfile {
  provider: ProviderId;
  accountId?: string;
  email?: string;
  displayName?: string;
}

export interface PutOptions {
  expectedRevision?: Revision;
}

export interface SettingsStore {
  connect(provider: ProviderId): Promise<void>;
  disconnect(): Promise<void>;
  currentProvider(): ProviderId | null;
  isConnected(): Promise<boolean>;
  getProfile(): Promise<ConnectedProfile | null>;

  get<T>(key: string): Promise<SettingsEnvelope<T> | null>;
  put<T>(key: string, data: T, options?: PutOptions): Promise<SettingsEnvelope<T>>;
  delete(key: string): Promise<void>;
  list(): Promise<SettingsSummary[]>;
}
```

## Internal provider port

```ts
export interface DocumentStoreProvider {
  readonly id: ProviderId;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
  getProfile(): Promise<ConnectedProfile | null>;

  getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null>;
  putDocument<T>(doc: SettingsEnvelope<T>, options?: PutOptions): Promise<SettingsEnvelope<T>>;
  deleteDocument(key: string): Promise<void>;
  listDocuments(): Promise<SettingsSummary[]>;
}
```

## Error model

```ts
export class SettingsStoreError extends Error {
  constructor(message: string, public readonly code: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SettingsStoreError';
  }
}

export class NotConnectedError extends SettingsStoreError {
  constructor() { super('No provider connected', 'NOT_CONNECTED'); }
}

export class UnsupportedProviderError extends SettingsStoreError {
  constructor(provider: string) { super(`Unsupported provider: ${provider}`, 'UNSUPPORTED_PROVIDER'); }
}

export class DocumentNotFoundError extends SettingsStoreError {
  constructor(key: string) { super(`Document not found: ${key}`, 'DOCUMENT_NOT_FOUND'); }
}

export class ConflictError extends SettingsStoreError {
  constructor(key: string) { super(`Revision conflict for: ${key}`, 'CONFLICT'); }
}

export class AuthRequiredError extends SettingsStoreError {
  constructor(provider: string) { super(`Authentication required for ${provider}`, 'AUTH_REQUIRED'); }
}

export class ProviderUnavailableError extends SettingsStoreError {
  constructor(provider: string) { super(`Provider unavailable on this runtime: ${provider}`, 'PROVIDER_UNAVAILABLE'); }
}
```

## Provider capabilities

```ts
export type ProviderCapability =
  | 'web'
  | 'react-native'
  | 'ios'
  | 'android'
  | 'offline-cache'
  | 'least-privilege-app-scope'
  | 'pkce-oauth'
  | 'apple-only-runtime';

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  capabilities: ProviderCapability[];
  isSupported(): Promise<boolean>;
  create(): DocumentStoreProvider;
}
```

## Core manager implementation sketch

```ts
export class DefaultSettingsStore implements SettingsStore {
  private current: DocumentStoreProvider | null = null;

  constructor(private readonly registry: Map<ProviderId, ProviderDescriptor>) {}

  async connect(provider: ProviderId): Promise<void> {
    const descriptor = this.registry.get(provider);
    if (!descriptor) throw new UnsupportedProviderError(provider);
    if (!(await descriptor.isSupported())) throw new ProviderUnavailableError(provider);
    this.current = descriptor.create();
    await this.current.connect();
  }

  async disconnect(): Promise<void> {
    if (this.current) await this.current.disconnect();
    this.current = null;
  }

  currentProvider(): ProviderId | null {
    return this.current?.id ?? null;
  }

  async isConnected(): Promise<boolean> {
    return this.current ? this.current.isConnected() : false;
  }

  async getProfile(): Promise<ConnectedProfile | null> {
    return this.current ? this.current.getProfile() : null;
  }

  async get<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    this.ensureCurrent();
    return this.current!.getDocument<T>(key);
  }

  async put<T>(key: string, data: T, options?: PutOptions): Promise<SettingsEnvelope<T>> {
    this.ensureCurrent();
    const existing = await this.current!.getDocument<T>(key);
    const doc: SettingsEnvelope<T> = {
      key,
      schemaVersion: existing?.schemaVersion ?? 1,
      updatedAt: new Date().toISOString(),
      revision: existing?.revision,
      data,
    };
    return this.current!.putDocument(doc, options);
  }

  async delete(key: string): Promise<void> {
    this.ensureCurrent();
    await this.current!.deleteDocument(key);
  }

  async list(): Promise<SettingsSummary[]> {
    this.ensureCurrent();
    return this.current!.listDocuments();
  }

  private ensureCurrent(): void {
    if (!this.current) throw new NotConnectedError();
  }
}
```

## Auth abstraction

```ts
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: 'Bearer';
}

export interface OAuthClient {
  login(): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string>;
  getTokens(): Promise<OAuthTokens | null>;
  getAuthHeaders(): Promise<Record<string, string>>;
}
```

## File-backed base adapter

Google Drive, Dropbox, and OneDrive can all be normalized through an internal file-based helper because each has an app-scoped area meant for application settings [web:28][web:33][page:1].

```ts
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

  protected keyToFileName(key: string): string {
    return `${encodeURIComponent(key)}.json`;
  }

  protected fileNameToKey(fileName: string): string {
    return decodeURIComponent(fileName.replace(/\.json$/, ''));
  }

  protected abstract readFile(fileName: string): Promise<{ text: string; meta: FileEntry } | null>;
  protected abstract writeFile(fileName: string, body: string, options?: PutOptions): Promise<FileEntry>;
  protected abstract removeFile(fileName: string): Promise<void>;
  protected abstract listFiles(): Promise<FileEntry[]>;

  async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    const file = await this.readFile(this.keyToFileName(key));
    if (!file) return null;
    const parsed = JSON.parse(file.text) as SettingsEnvelope<T>;
    return { ...parsed, key, revision: file.meta.revision ?? parsed.revision };
  }

  async putDocument<T>(doc: SettingsEnvelope<T>, options?: PutOptions): Promise<SettingsEnvelope<T>> {
    const payload = JSON.stringify({ ...doc, updatedAt: new Date().toISOString() });
    const meta = await this.writeFile(this.keyToFileName(doc.key), payload, options);
    return { ...doc, updatedAt: meta.updatedAt ?? doc.updatedAt, revision: meta.revision };
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
```

## Google Drive adapter sketch

Google Drive should target the hidden `appDataFolder` with the narrow `drive.appdata` scope. Files are created with `parents: ['appDataFolder']`, listed with `spaces=appDataFolder`, and downloaded with `files.get(...?alt=media)` [web:28][page:2].

```ts
export class GoogleDriveProvider extends FileBackedDocumentProvider {
  readonly id = 'google-drive' as const;

  constructor(private readonly auth: OAuthClient, private readonly fetchFn: typeof fetch = fetch) {
    super();
  }

  async connect() { await this.auth.login(); }
  async disconnect() { await this.auth.logout(); }
  async isConnected() { return !!(await this.auth.getTokens()); }
  async getProfile() { return { provider: this.id }; }

  protected async readFile(fileName: string) {
    const file = await this.findFileByName(fileName);
    if (!file) return null;
    const res = await this.fetchFn(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: await this.auth.getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`Drive read failed: ${res.status}`);
    return { text: await res.text(), meta: this.toEntry(file) };
  }

  protected async writeFile(fileName: string, body: string) {
    const existing = await this.findFileByName(fileName);
    return existing ? this.updateFile(existing.id, fileName, body) : this.createFile(fileName, body);
  }

  protected async removeFile(fileName: string) {
    const file = await this.findFileByName(fileName);
    if (!file) return;
    const res = await this.fetchFn(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
      method: 'DELETE',
      headers: await this.auth.getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`Drive delete failed: ${res.status}`);
  }

  protected async listFiles() {
    const res = await this.fetchFn('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,mimeType,size,modifiedTime)', {
      headers: await this.auth.getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const json = await res.json() as { files?: Array<any> };
    return (json.files ?? []).map(f => this.toEntry(f));
  }

  private async findFileByName(name: string) {
    const files = await this.listFiles();
    return files.find(f => f.name === name) ?? null;
  }

  private async createFile(name: string, body: string): Promise<FileEntry> {
    const metadata = { name, parents: ['appDataFolder'] };
    const boundary = 'settings-store-boundary';
    const payload =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;

    const res = await this.fetchFn('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size', {
      method: 'POST',
      headers: {
        ...(await this.auth.getAuthHeaders()),
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: payload,
    });
    if (!res.ok) throw new Error(`Drive create failed: ${res.status}`);
    return this.toEntry(await res.json());
  }

  private async updateFile(id: string, name: string, body: string): Promise<FileEntry> {
    const res = await this.fetchFn(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&fields=id,name,modifiedTime,size`, {
      method: 'PATCH',
      headers: {
        ...(await this.auth.getAuthHeaders()),
        'Content-Type': 'application/json',
      },
      body,
    });
    if (!res.ok) throw new Error(`Drive update failed: ${res.status}`);
    return this.toEntry(await res.json());
  }

  private toEntry(f: any): FileEntry {
    return {
      id: f.id,
      name: f.name,
      logicalKey: this.fileNameToKey(f.name),
      updatedAt: f.modifiedTime,
      size: f.size ? Number(f.size) : undefined,
      revision: f.version ? String(f.version) : undefined,
    };
  }
}
```

## OneDrive adapter sketch

OneDrive should use the special app folder at `/special/approot`, which Microsoft documents as a least-privilege place for application settings and other app files using `Files.ReadWrite.AppFolder` [page:1].

```ts
export class OneDriveProvider extends FileBackedDocumentProvider {
  readonly id = 'onedrive' as const;

  constructor(private readonly auth: OAuthClient, private readonly fetchFn: typeof fetch = fetch) {
    super();
  }

  async connect() { await this.auth.login(); }
  async disconnect() { await this.auth.logout(); }
  async isConnected() { return !!(await this.auth.getTokens()); }
  async getProfile() { return { provider: this.id }; }

  protected async readFile(fileName: string) {
    const res = await this.fetchFn(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${fileName}:/content`, {
      headers: await this.auth.getAuthHeaders(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`OneDrive read failed: ${res.status}`);
    const meta = await this.getMetadata(fileName);
    return { text: await res.text(), meta };
  }

  protected async writeFile(fileName: string, body: string) {
    const res = await this.fetchFn(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${fileName}:/content`, {
      method: 'PUT',
      headers: {
        ...(await this.auth.getAuthHeaders()),
        'Content-Type': 'application/json',
      },
      body,
    });
    if (!res.ok) throw new Error(`OneDrive write failed: ${res.status}`);
    return this.toEntry(await res.json());
  }

  protected async removeFile(fileName: string) {
    const res = await this.fetchFn(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${fileName}`, {
      method: 'DELETE',
      headers: await this.auth.getAuthHeaders(),
    });
    if (!(res.ok || res.status === 404)) throw new Error(`OneDrive delete failed: ${res.status}`);
  }

  protected async listFiles() {
    const res = await this.fetchFn('https://graph.microsoft.com/v1.0/me/drive/special/approot/children', {
      headers: await this.auth.getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`OneDrive list failed: ${res.status}`);
    const json = await res.json() as { value?: Array<any> };
    return (json.value ?? []).map(v => this.toEntry(v));
  }

  private async getMetadata(fileName: string): Promise<FileEntry> {
    const res = await this.fetchFn(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${fileName}`, {
      headers: await this.auth.getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`OneDrive metadata failed: ${res.status}`);
    return this.toEntry(await res.json());
  }

  private toEntry(v: any): FileEntry {
    return {
      id: v.id,
      name: v.name,
      logicalKey: this.fileNameToKey(v.name),
      updatedAt: v.lastModifiedDateTime,
      revision: v.eTag ?? v.cTag,
      size: typeof v.size === 'number' ? v.size : undefined,
    };
  }
}
```

## Dropbox adapter sketch

Dropbox should use App Folder access and PKCE for public clients. It fits the same file-backed provider family, even though the concrete endpoints differ [web:33].

```ts
export class DropboxProvider extends FileBackedDocumentProvider {
  readonly id = 'dropbox' as const;

  constructor(private readonly auth: OAuthClient, private readonly fetchFn: typeof fetch = fetch) {
    super();
  }

  async connect() { await this.auth.login(); }
  async disconnect() { await this.auth.logout(); }
  async isConnected() { return !!(await this.auth.getTokens()); }
  async getProfile() { return { provider: this.id }; }

  protected async readFile(fileName: string) {
    const path = `/${fileName}`;
    const res = await this.fetchFn('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        ...(await this.auth.getAuthHeaders()),
        'Dropbox-API-Arg': JSON.stringify({ path }),
      },
    });
    if (res.status === 409) return null;
    if (!res.ok) throw new Error(`Dropbox read failed: ${res.status}`);
    const meta = JSON.parse(res.headers.get('Dropbox-API-Result') ?? '{}');
    return { text: await res.text(), meta: this.toEntry(meta) };
  }

  protected async writeFile(fileName: string, body: string) {
    const path = `/${fileName}`;
    const res = await this.fetchFn('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        ...(await this.auth.getAuthHeaders()),
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', mute: true }),
      },
      body,
    });
    if (!res.ok) throw new Error(`Dropbox write failed: ${res.status}`);
    return this.toEntry(await res.json());
  }

  protected async removeFile(fileName: string) {
    const res = await this.fetchFn('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: {
        ...(await this.auth.getAuthHeaders()),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: `/${fileName}` }),
    });
    if (!res.ok) throw new Error(`Dropbox delete failed: ${res.status}`);
  }

  protected async listFiles() {
    const res = await this.fetchFn('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        ...(await this.auth.getAuthHeaders()),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: '' }),
    });
    if (!res.ok) throw new Error(`Dropbox list failed: ${res.status}`);
    const json = await res.json() as { entries?: Array<any> };
    return (json.entries ?? []).filter(e => e['.tag'] === 'file').map(e => this.toEntry(e));
  }

  private toEntry(v: any): FileEntry {
    return {
      id: v.id,
      name: v.name,
      logicalKey: this.fileNameToKey(v.name),
      updatedAt: v.server_modified,
      revision: v.rev,
      size: typeof v.size === 'number' ? v.size : undefined,
    };
  }
}
```

## iCloud adapter sketch

iCloud should be modeled as a record-backed provider. Apple positions CloudKit as a private-per-user cloud database/container with support across Apple platforms and the web, so it does not naturally map to an app-folder filesystem [page:2].

```ts
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
    const saved = await this.saveRecord({
      recordName: doc.key,
      changeTag: doc.revision,
      fields: {
        key: doc.key,
        schemaVersion: doc.schemaVersion,
        updatedAt: new Date().toISOString(),
        data: doc.data,
      },
    }, options);

    return {
      key: doc.key,
      schemaVersion: Number(saved.fields.schemaVersion ?? doc.schemaVersion),
      updatedAt: String(saved.fields.updatedAt ?? new Date().toISOString()),
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
```

```ts
export class ICloudProvider extends RecordBackedDocumentProvider {
  readonly id = 'icloud' as const;

  async connect() { /* CloudKit JS / native auth bootstrap */ }
  async disconnect() { /* clear session */ }
  async isConnected() { return true; }
  async getProfile() { return { provider: this.id }; }

  protected async getRecord(key: string): Promise<CloudRecord | null> {
    throw new Error('Implement with CloudKit private database query/fetch');
  }

  protected async saveRecord(record: CloudRecord): Promise<CloudRecord> {
    throw new Error('Implement with CloudKit saveRecords');
  }

  protected async removeRecord(key: string): Promise<void> {
    throw new Error('Implement with CloudKit deleteRecords');
  }

  protected async listRecords(): Promise<CloudRecord[]> {
    throw new Error('Implement with CloudKit queryRecords');
  }
}
```

## Monorepo structure

A monorepo is a strong fit because the core types stay shared while provider packages remain isolated.

```text
settings-store/
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ turbo.json
├─ apps/
│  ├─ docs/
│  └─ playground/
├─ packages/
│  ├─ core/
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ src/
│  │     ├─ index.ts
│  │     ├─ types.ts
│  │     ├─ errors.ts
│  │     ├─ manager.ts
│  │     ├─ registry.ts
│  │     └─ providers/
│  │        ├─ document-store-provider.ts
│  │        ├─ file-backed-document-provider.ts
│  │        └─ record-backed-document-provider.ts
│  ├─ auth-web/
│  │  └─ src/
│  │     ├─ oauth-client.ts
│  │     ├─ pkce.ts
│  │     ├─ redirect-handler.ts
│  │     └─ token-store.ts
│  ├─ auth-react-native/
│  │  └─ src/
│  │     ├─ oauth-client.ts
│  │     ├─ deep-link-handler.ts
│  │     └─ secure-token-store.ts
│  ├─ provider-google-drive/
│  │  └─ src/
│  │     ├─ index.ts
│  │     ├─ google-drive-provider.ts
│  │     ├─ google-drive-auth.ts
│  │     └─ google-drive-mapper.ts
│  ├─ provider-dropbox/
│  │  └─ src/
│  │     ├─ index.ts
│  │     ├─ dropbox-provider.ts
│  │     └─ dropbox-auth.ts
│  ├─ provider-onedrive/
│  │  └─ src/
│  │     ├─ index.ts
│  │     ├─ onedrive-provider.ts
│  │     └─ onedrive-auth.ts
│  ├─ provider-icloud/
│  │  └─ src/
│  │     ├─ index.ts
│  │     ├─ icloud-provider.ts
│  │     ├─ cloudkit-client.ts
│  │     └─ record-mapper.ts
│  ├─ provider-local/
│  │  └─ src/
│  │     ├─ index.ts
│  │     └─ local-provider.ts
│  ├─ testing/
│  │  └─ src/
│  │     ├─ fixtures.ts
│  │     ├─ fake-provider.ts
│  │     └─ provider-contract-tests.ts
│  └─ eslint-config/
│     └─ index.js
└─ examples/
   ├─ react-web/
   ├─ react-native/
   └─ capacitor/
```

## Package responsibilities

- `core`: provider-agnostic contracts, registry, manager, errors, test contracts.
- `auth-web`: browser OAuth PKCE helpers.
- `auth-react-native`: native/hybrid auth glue, deep links, secure token storage.
- `provider-google-drive`: Google Drive appDataFolder adapter [page:2].
- `provider-dropbox`: Dropbox App Folder adapter [web:33].
- `provider-onedrive`: Microsoft Graph app folder adapter [page:1].
- `provider-icloud`: CloudKit adapter [page:2].
- `provider-local`: offline fallback and test convenience.
- `testing`: reusable provider conformance tests.

## Registry setup example

```ts
const registry = new Map<ProviderId, ProviderDescriptor>([
  ['google-drive', {
    id: 'google-drive',
    label: 'Google Drive',
    capabilities: ['web', 'react-native', 'pkce-oauth', 'least-privilege-app-scope'],
    isSupported: async () => true,
    create: () => new GoogleDriveProvider(googleAuthClient),
  }],
  ['dropbox', {
    id: 'dropbox',
    label: 'Dropbox',
    capabilities: ['web', 'react-native', 'pkce-oauth', 'least-privilege-app-scope'],
    isSupported: async () => true,
    create: () => new DropboxProvider(dropboxAuthClient),
  }],
  ['onedrive', {
    id: 'onedrive',
    label: 'OneDrive',
    capabilities: ['web', 'react-native', 'pkce-oauth', 'least-privilege-app-scope'],
    isSupported: async () => true,
    create: () => new OneDriveProvider(oneDriveAuthClient),
  }],
  ['icloud', {
    id: 'icloud',
    label: 'iCloud',
    capabilities: ['web', 'ios', 'apple-only-runtime'],
    isSupported: async () => isAppleRuntime(),
    create: () => new ICloudProvider(),
  }],
]);

export const settingsStore = new DefaultSettingsStore(registry);
```

## Suggested implementation sequence

1. Build and test `core` first.
2. Add `provider-local` for contract validation and app development.
3. Implement Google Drive and OneDrive next because their app-scoped storage is explicitly documented for settings/configuration [page:1][page:2].
4. Add Dropbox after the file-backed base class is stable [web:33].
5. Add iCloud last because it belongs to the record-backed family and has the strongest platform/runtime constraints [page:2].

## Final recommendation

Build the reusable abstraction yourself, but keep it intentionally small. The winning design is a **document-oriented settings store** with provider adapters, not a universal filesystem abstraction, because that is the model that stays clean when you include Google Drive app data, OneDrive app folder, Dropbox app folder, and iCloud CloudKit together [web:28][page:1][page:2].
