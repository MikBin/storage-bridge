# Dropbox Provider Design

## Overview

Implement `packages/provider-dropbox` extending `FileBackedDocumentProvider`. Uses Dropbox App Folder access (scoped to `/Apps/<app-name>/`) with PKCE OAuth. All operations use the Dropbox API v2 content and RPC endpoints.

## Architecture

Follows the identical pattern established by `provider-google-drive` and `provider-onedrive`:
- Constructor accepts `{ auth: OAuthClient; fetchFn?: typeof fetch }`
- Delegates auth lifecycle to injected `OAuthClient`
- Implements `readFile`, `writeFile`, `removeFile`, `listFiles` as `public` (for testability, matching Google Drive pattern)
- Uses a separate mapper module (`dropbox-mapper.ts`) for `DropboxFileRaw` → `FileEntry` conversion
- Uses a mock module (`dropbox-api-mock.ts`) for unit and contract tests

## Dropbox API Endpoints

| Operation | Endpoint | Method | Notes |
|-----------|----------|--------|-------|
| Read | `content.dropboxapi.com/2/files/download` | POST | File path in `Dropbox-API-Arg` header; body is file content; metadata in `Dropbox-API-Result` response header |
| Write | `content.dropboxapi.com/2/files/upload` | POST | `mode: 'overwrite'` for upsert; file path in `Dropbox-API-Arg` header; body is file content |
| Delete | `api.dropboxapi.com/2/files/delete_v2` | POST | JSON body with `{ path }` |
| List | `api.dropboxapi.com/2/files/list_folder` | POST | JSON body with `{ path: '' }`; filter entries where `.tag === 'file'` |

## Key Design Decisions

### Conflict Detection: Client-Side Rev Check
Dropbox supports `mode: 'update'` with an explicit `rev` parameter for server-side conflict detection. However, to stay consistent with the Google Drive provider's approach (and because the base class doesn't mandate server-side checks), we use `mode: 'overwrite'` and perform client-side conflict detection in `writeFile` — fetching the existing file first and comparing `rev` when `expectedRevision` is provided.

### Metadata from Response Headers
The `/2/files/download` endpoint returns file metadata in the `Dropbox-API-Result` response header as JSON. This is parsed to obtain the `FileEntry` metadata for `readFile`, avoiding a separate metadata call (unlike OneDrive which needs a second request).

### Raw Type Mapping

```typescript
interface DropboxFileRaw {
  id: string;           // e.g. "id:abc123"
  name: string;         // filename
  '.tag': string;       // "file" or "folder"
  server_modified?: string;  // ISO timestamp
  rev?: string;         // revision identifier
  size?: number;        // bytes
}
```

Mapper: `toFileEntry(raw, fileNameToKey)` → `FileEntry`

## File Structure

```
packages/provider-dropbox/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts
    ├── dropbox-mapper.ts
    ├── dropbox-provider.ts
    └── __tests__/
        ├── dropbox-api-mock.ts
        ├── dropbox-mapper.test.ts
        ├── dropbox-provider.test.ts
        └── dropbox-contract.test.ts
```

## Error Handling

- 401/403 → `AuthRequiredError`
- 409 on download → file not found, return `null`
- 409 on delete_v2 → path not found, treat as no-op
- Other non-ok → `SettingsStoreError` with provider-specific code

## Testing

- **Mapper tests**: Pure unit tests for `toFileEntry()` with full/missing fields
- **API mock**: Intercepts fetch calls, tracks files in a `Map`, handles all CRUD endpoints
- **Provider tests**: Lifecycle, CRUD, optimistic concurrency, error handling — matching Google Drive test structure
- **Contract tests**: `describeProviderContract` from `@storage-bridge/testing` against mock