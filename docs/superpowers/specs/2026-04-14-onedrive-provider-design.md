# OneDrive Provider Design

**Task:** TASK-12 — OneDrive Provider
**Date:** 2026-04-14
**Status:** Draft
**Depends on:** TASK-3 (Provider Port and Base Adapters) — complete, TASK-9 (Auth Web Package) — complete

## Overview

Implement `packages/provider-onedrive` — a concrete `FileBackedDocumentProvider` that stores keyed JSON documents in OneDrive's special app folder (`/special/approot`) using the Microsoft Graph API v1.0 with `Files.ReadWrite.AppFolder` permission. Auth is delegated to an injected `OAuthClient`. A mapper module translates Graph API DriveItem responses to `FileEntry` objects.

## Design Decisions

### 1. Package structure follows established pattern

**Choice:** Three source files plus index barrel:

```
packages/provider-onedrive/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts
    ├── onedrive-provider.ts
    ├── onedrive-mapper.ts
    └── __tests__/
        ├── onedrive-provider.test.ts
        ├── onedrive-mapper.test.ts
        ├── onedrive-api-mock.ts
        └── onedrive-contract.test.ts
```

**Rationale:** Mirrors the Google Drive provider structure exactly. Separates the API-to-FileEntry mapping logic (testable in isolation) from the provider class.

### 2. Path-based addressing (no findFileByName)

**Choice:** Use Microsoft Graph path-based URLs like `/me/drive/special/approot:/{fileName}:/content` directly. No need for a file-ID lookup step.

**Rationale:** Unlike Google Drive (which requires finding a file by name to get its ID), OneDrive supports path-based addressing in the app folder. This eliminates an extra API call per operation, making the OneDrive provider simpler and more efficient.

### 3. Native optimistic concurrency via If-Match header

**Choice:** When `PutOptions.expectedRevision` is provided, include an `If-Match: {etag}` header on the PUT request. A 412 Precondition Failed response is mapped to `ConflictError`.

**Rationale:** Microsoft Graph natively supports conditional updates via `If-Match` with ETags. This is more reliable than Google Drive's pre-flight check approach (no TOCTOU race window). OneDrive returns a 412 status when the ETag doesn't match.

### 4. Separate metadata fetch for readFile

**Choice:** `readFile` makes two API calls: one GET for content (`:/content`) and one GET for metadata (item endpoint without `:/content`). The metadata call provides the ETag needed for the `FileEntry.revision`.

**Rationale:** The content endpoint returns raw bytes without metadata. We need the ETag from the DriveItem resource for revision tracking. While this is two calls, it only applies to reads (writes return metadata in the response). For a settings sync library, read frequency is low enough that this overhead is acceptable.

### 5. ETag as revision string

**Choice:** Use `eTag` from DriveItem as `FileEntry.revision`, with `cTag` as fallback (`eTag ?? cTag`).

**Rationale:** `eTag` changes when the file content changes (what we want). `cTag` changes on any modification including metadata changes. Using `eTag` first gives us content-specific revision tracking.

### 6. No `onedrive-auth.ts` in this package

**Choice:** Auth is entirely delegated to the injected `OAuthClient`. No provider-specific auth file.

**Rationale:** Same as Google Drive provider. The `OAuthClient` interface from `@storage-bridge/auth-web` handles all OAuth concerns. OneDrive-specific config (scopes, endpoints) is passed to the `OAuthClient` at construction time by the consumer.

### 7. Error handling with specific error types

**Choice:** Map Graph API error responses to appropriate `SettingsStoreError` subclasses:
- 401/403 → `AuthRequiredError`
- 404 on read content → return `null`
- 404 on delete → silent (idempotent)
- 412 on write → `ConflictError`
- Other errors → `SettingsStoreError` with status code

**Rationale:** Follows the error model from `@storage-bridge/core`. The 412 mapping is specific to OneDrive's `If-Match` support.

## OneDriveItemRaw Type

```ts
/** Shape of a Microsoft Graph DriveItem resource (only fields we use) */
export interface OneDriveItemRaw {
  id: string;
  name: string;
  lastModifiedDateTime?: string;
  eTag?: string;
  cTag?: string;
  size?: number;
}
```

## onedrive-mapper.ts

```ts
import type { FileEntry } from '@storage-bridge/core';

export interface OneDriveItemRaw {
  id: string;
  name: string;
  lastModifiedDateTime?: string;
  eTag?: string;
  cTag?: string;
  size?: number;
}

export function toFileEntry(raw: OneDriveItemRaw, fileNameToKey: (name: string) => string): FileEntry {
  return {
    id: raw.id,
    name: raw.name,
    logicalKey: fileNameToKey(raw.name),
    updatedAt: raw.lastModifiedDateTime,
    revision: raw.eTag ?? raw.cTag,
    size: typeof raw.size === 'number' ? raw.size : undefined,
  };
}
```

## OneDriveProvider

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
    return { provider: this.id as const };
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
```

## Testing

### Unit tests with mocked fetch

All Graph API interactions are tested via a mocked `fetchFn`. Tests create a `OneDriveProvider` with a fake `OAuthClient` and a controlled `fetchFn` mock.

**Test categories:**

1. **Mapper tests** (`onedrive-mapper.test.ts`) — pure transformation, no mocking needed:
   - Maps a full `OneDriveItemRaw` to `FileEntry` with all fields
   - Handles missing optional fields (size, eTag, lastModifiedDateTime)
   - Uses eTag as revision, falls back to cTag
   - Handles numeric size (already a number in Graph API, unlike Google Drive's string)

2. **Provider lifecycle tests** (part of `onedrive-provider.test.ts`):
   - `connect()` delegates to `auth.login()`
   - `disconnect()` delegates to `auth.logout()`
   - `isConnected()` returns true when tokens exist
   - `isConnected()` returns false when tokens are null
   - `getProfile()` returns profile with provider id when connected
   - `getProfile()` returns null when no tokens

3. **CRUD operation tests** (using mocked fetchFn):
   - `readFile()` calls content endpoint, returns null on 404
   - `readFile()` makes separate metadata call for ETag
   - `writeFile()` uses PUT with content body
   - `writeFile()` creates new file when none exists
   - `writeFile()` updates existing file (PUT is idempotent)
   - `removeFile()` deletes file, silent on 404
   - `listFiles()` calls children endpoint

4. **Optimistic concurrency tests**:
   - `writeFile` with matching `expectedRevision` includes `If-Match` header and succeeds
   - `writeFile` with mismatched `expectedRevision` gets 412 and throws `ConflictError`
   - `writeFile` without `expectedRevision` always succeeds (no `If-Match` header)

5. **Error handling tests**:
   - 401/403 responses throw `AuthRequiredError`
   - 404 on read returns `null`
   - 404 on delete is silent
   - 412 on write throws `ConflictError`
   - Other errors throw `SettingsStoreError`

### Contract tests

The provider contract tests from `@storage-bridge/testing` will be run against `OneDriveProvider` using a `OneDriveApiMock` helper that:
- Maintains an in-memory map of files
- Responds to content GET, item metadata GET, PUT content, DELETE, and children listing
- Tracks ETags (generates new ETag on each write)
- Returns 412 when `If-Match` doesn't match current ETag

## Acceptance Criteria Mapping

| AC | How Satisfied |
|----|---------------|
| #1 Extends FileBackedDocumentProvider | `OneDriveProvider extends FileBackedDocumentProvider` |
| #2 Uses /me/drive/special/approot endpoints | All API calls use `GRAPH_BASE = '.../special/approot'` |
| #3 Returns null on 404 for read | `readFile` checks `res.status === 404` and returns `null` |
| #4 Delegates auth to injected OAuthClient | Constructor takes `OAuthClient`, all API calls use `auth.getAuthHeaders()` |
| #5 Passes provider contract tests | `OneDriveApiMock` enables contract test suite |
| #6 Unit tests with mocked fetch | All tests use injected `fetchFn` mock |

## Out of Scope

- OneDrive-specific auth configuration (clientId, scopes) — consumer responsibility
- Token refresh logic — handled by `OAuthClient`
- Rate limiting / retry logic — future enhancement
- Delta queries / change notifications
- Microsoft Graph beta API
- React Native-specific fetch handling