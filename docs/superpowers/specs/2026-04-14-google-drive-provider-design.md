# Google Drive Provider Design

**Task:** TASK-11 — Google Drive Provider
**Date:** 2026-04-14
**Status:** Draft
**Depends on:** TASK-3 (Provider Port and Base Adapters) — complete, TASK-9 (Auth Web Package) — complete

## Overview

Implement `packages/provider-google-drive` — a concrete `FileBackedDocumentProvider` that stores keyed JSON documents in Google Drive's hidden `appDataFolder` using the `drive.appdata` scope. Auth is delegated to an injected `OAuthClient`. A mapper module translates Drive API responses to `FileEntry` objects.

## Design Decisions

### 1. Package structure follows established pattern

**Choice:** Three source files plus index barrel:

```
packages/provider-google-drive/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts
    ├── google-drive-provider.ts
    ├── google-drive-mapper.ts
    └── __tests__/
        ├── google-drive-provider.test.ts
        └── google-drive-mapper.test.ts
```

**Rationale:** Separates the API-to-FileEntry mapping logic (testable in isolation) from the provider class. Follows the architecture doc's proposed structure.

### 2. `google-drive-mapper.ts` is a pure function module

**Choice:** Export a single `toFileEntry(raw: GoogleDriveFileRaw): FileEntry` function (and a `GoogleDriveFileRaw` type for the raw API shape).

**Rationale:** The mapper has no dependencies — it's a pure data transformation. Testing it independently avoids mocking fetch for mapping tests.

### 3. Optimistic concurrency via pre-flight revision check

**Choice:** When `PutOptions.expectedRevision` is provided, `writeFile` fetches the current file metadata first and compares its `version` field to `expectedRevision`. If they don't match, throw `ConflictError`. Otherwise proceed with the update.

**Rationale:** Google Drive API v3 does not support conditional `If-Match` headers for file content updates. A pre-flight check is the simplest approach that satisfies the contract tests. The small TOCTOU race window is acceptable for a settings sync library operating on low-contention app data.

### 4. `findFileByName` uses `listFiles` with caching consideration

**Choice:** `findFileByName` calls the Drive API `files.list` with a `q` parameter to filter by name, rather than listing all files and filtering client-side.

**Rationale:** The architecture sketch lists all files and filters client-side, but a server-side query (`q: name='fileName'`) is more efficient. However, for the `appDataFolder` space (typically small number of files), either approach works. We'll use the server-side query for correctness and efficiency.

### 5. Drive file `version` as revision string

**Choice:** Use `String(file.version)` as the `FileEntry.revision`. Google Drive increments the version integer on every content modification.

**Rationale:** This is the closest equivalent to an ETag for Google Drive files. It changes on every write, is stable across reads, and is returned by both the upload and metadata endpoints.

### 6. Error handling with specific error types

**Choice:** Map Drive API error responses to appropriate `SettingsStoreError` subclasses:
- 401/403 → `AuthRequiredError`
- 404 on delete → silent (idempotent)
- 404 on read → return `null`
- Other errors → `SettingsStoreError` with status code

**Rationale:** Follows the error model from `@storage-bridge/core`. Callers get meaningful error types they can handle.

### 7. No `google-drive-auth.ts` in this package

**Choice:** Auth is entirely delegated to the injected `OAuthClient`. No provider-specific auth file.

**Rationale:** The architecture doc listed `google-drive-auth.ts`, but the `OAuthClient` interface from `@storage-bridge/auth-web` already handles all OAuth concerns. The Google Drive-specific config (scopes, endpoints) is passed to the `OAuthClient` at construction time by the consumer. This keeps auth concerns properly separated.

## File Structure

```
packages/provider-google-drive/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                          # barrel: re-exports provider + mapper
    ├── google-drive-provider.ts          # GoogleDriveProvider class
    ├── google-drive-mapper.ts            # toFileEntry + GoogleDriveFileRaw type
    └── __tests__/
        ├── google-drive-provider.test.ts # unit tests with mocked fetch
        └── google-drive-mapper.test.ts   # pure mapping tests
```

## GoogleDriveFileRaw Type

```ts
/** Shape of a Google Drive file resource from the v3 API */
export interface GoogleDriveFileRaw {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  version?: string;
}
```

## google-drive-mapper.ts

```ts
import type { FileEntry } from '@storage-bridge/core';

export interface GoogleDriveFileRaw {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  version?: string;
}

export function toFileEntry(raw: GoogleDriveFileRaw, fileNameToKey: (name: string) => string): FileEntry {
  return {
    id: raw.id,
    name: raw.name,
    logicalKey: fileNameToKey(raw.name),
    updatedAt: raw.modifiedTime,
    revision: raw.version ? String(raw.version) : undefined,
    size: raw.size ? Number(raw.size) : undefined,
  };
}
```

## GoogleDriveProvider

```ts
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
    return { provider: this.id as const };
  }

  protected async readFile(fileName: string): Promise<{ text: string; meta: FileEntry } | null> {
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

  protected async writeFile(fileName: string, body: string, options?: PutOptions): Promise<FileEntry> {
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

  protected async removeFile(fileName: string): Promise<void> {
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

  protected async listFiles(): Promise<FileEntry[]> {
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
```

## Testing

### Unit tests with mocked fetch

All Drive API interactions are tested via a mocked `fetchFn`. Tests create a `GoogleDriveProvider` with a fake `OAuthClient` and a controlled `fetchFn` mock.

**Test categories:**

1. **Mapper tests** (`google-drive-mapper.test.ts`) — pure transformation, no mocking needed:
   - Maps a full `GoogleDriveFileRaw` to `FileEntry` with all fields
   - Handles missing optional fields (size, version, modifiedTime)
   - Converts version to string
   - Converts size to number

2. **Provider lifecycle tests** (part of `google-drive-provider.test.ts`):
   - `connect()` delegates to `auth.login()`
   - `disconnect()` delegates to `auth.logout()`
   - `isConnected()` returns true when tokens exist
   - `isConnected()` returns false when tokens are null
   - `getProfile()` returns profile with provider id when connected

3. **CRUD operation tests** (using mocked fetchFn):
   - `listFiles()` calls correct Drive API endpoint with `spaces=appDataFolder`
   - `readFile()` downloads file content with `alt=media`
   - `writeFile()` creates new file with multipart upload when no existing file
   - `writeFile()` updates existing file with PATCH media upload
   - `removeFile()` deletes file by ID
   - `removeFile()` is no-op when file not found
   - `findFileByName()` uses server-side query filter

4. **Optimistic concurrency tests**:
   - `writeFile` with matching `expectedRevision` succeeds
   - `writeFile` with mismatched `expectedRevision` throws `ConflictError`
   - `writeFile` with `expectedRevision` but no existing file throws `ConflictError`

5. **Error handling tests**:
   - 401/403 responses throw `AuthRequiredError`
   - 404 on read returns `null`
   - 404 on delete is silent
   - Other errors throw `SettingsStoreError`

### Contract tests

The provider contract tests from `@storage-bridge/testing` will be run against `GoogleDriveProvider` using a comprehensive fetch mock that simulates the Drive API. This requires a `GoogleDriveApiMock` helper that:
- Maintains an in-memory map of files
- Handles multipart upload parsing
- Responds to `files.list`, `files.get` (metadata + `alt=media`), file creation, update, and delete
- Tracks file versions (incrementing integer on each update)

## Acceptance Criteria Mapping

| AC | How Satisfied |
|----|---------------|
| #1 Extends FileBackedDocumentProvider | `GoogleDriveProvider extends FileBackedDocumentProvider` |
| #2 Uses appDataFolder with drive.appdata scope | `parents: ['appDataFolder']` on create, `spaces=appDataFolder` on list/query |
| #3 Multipart upload for create, PATCH for update | `createFile` uses multipart, `updateFile` uses media PATCH |
| #4 Delegates auth to injected OAuthClient | Constructor takes `OAuthClient`, all API calls use `auth.getAuthHeaders()` |
| #5 google-drive-mapper.ts maps API responses to FileEntry | `toFileEntry()` function in dedicated module |
| #6 Passes provider contract tests | `GoogleDriveApiMock` enables contract test suite |
| #7 Unit tests with mocked fetch | All tests use injected `fetchFn` mock |

## Out of Scope

- Google Drive-specific auth configuration (clientId, scopes) — consumer responsibility
- Token refresh logic — handled by `OAuthClient`
- Rate limiting / retry logic — future enhancement
- Batch operations
- Google Drive API v2 support
- React Native-specific fetch handling