# Google Drive Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `packages/provider-google-drive` extending `FileBackedDocumentProvider` with Google Drive API v3 integration, appDataFolder storage, multipart upload, and full test coverage.

**Architecture:** `GoogleDriveProvider` extends `FileBackedDocumentProvider`, implementing file primitives via Google Drive API v3. `google-drive-mapper.ts` maps raw Drive API responses to `FileEntry`. Auth delegated to injected `OAuthClient`. Tests use mocked `fetchFn`.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo, `@storage-bridge/core`, `@storage-bridge/auth-web`

**Spec:** `docs/superpowers/specs/2026-04-14-google-drive-provider-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/provider-google-drive/package.json` | Create | Package manifest |
| `packages/provider-google-drive/tsconfig.json` | Create | TypeScript config |
| `packages/provider-google-drive/vitest.config.ts` | Create | Vitest config |
| `packages/provider-google-drive/src/google-drive-mapper.ts` | Create | `GoogleDriveFileRaw` type + `toFileEntry()` |
| `packages/provider-google-drive/src/__tests__/google-drive-mapper.test.ts` | Create | Mapper unit tests |
| `packages/provider-google-drive/src/google-drive-provider.ts` | Create | `GoogleDriveProvider` class |
| `packages/provider-google-drive/src/__tests__/google-drive-provider.test.ts` | Create | Provider unit tests with mocked fetch |
| `packages/provider-google-drive/src/__tests__/google-drive-api-mock.ts` | Create | Shared Drive API mock for unit + contract tests |
| `packages/provider-google-drive/src/__tests__/google-drive-contract.test.ts` | Create | Contract conformance tests |
| `packages/provider-google-drive/src/index.ts` | Create | Barrel re-export |

---

### Task 1: Package Scaffold

**Files:**
- Create: `packages/provider-google-drive/package.json`
- Create: `packages/provider-google-drive/tsconfig.json`
- Create: `packages/provider-google-drive/vitest.config.ts`

- [ ] **Step 1: Create `packages/provider-google-drive/package.json`**

```json
{
  "name": "@storage-bridge/provider-google-drive",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@storage-bridge/core": "workspace:*"
  },
  "peerDependencies": {
    "@storage-bridge/auth-web": "workspace:*"
  },
  "devDependencies": {
    "@storage-bridge/auth-web": "workspace:*",
    "@storage-bridge/eslint-config": "workspace:*",
    "@storage-bridge/testing": "workspace:*",
    "@storage-bridge/typescript-config": "workspace:*",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Create `packages/provider-google-drive/tsconfig.json`**

```json
{
  "extends": "@storage-bridge/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/provider-google-drive/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`
Expected: Dependencies linked successfully

- [ ] **Step 5: Commit**

```bash
git add packages/provider-google-drive/package.json packages/provider-google-drive/tsconfig.json packages/provider-google-drive/vitest.config.yaml
git commit -m "chore(provider-google-drive): scaffold package"
```

---

### Task 2: Mapper — Failing Tests

**Files:**
- Create: `packages/provider-google-drive/src/__tests__/google-drive-mapper.test.ts`

- [ ] **Step 6: Write the failing mapper tests**

```ts
import { describe, it, expect } from 'vitest';
import { toFileEntry, type GoogleDriveFileRaw } from '../google-drive-mapper.js';

const defaultFileNameToKey = (name: string) => name.replace(/\.json$/, '');

describe('toFileEntry', () => {
  it('maps a full GoogleDriveFileRaw to FileEntry', () => {
    const raw: GoogleDriveFileRaw = {
      id: 'file-123',
      name: 'settings.json',
      mimeType: 'application/json',
      size: '256',
      modifiedTime: '2026-04-14T12:00:00.000Z',
      version: '42',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.id).toBe('file-123');
    expect(entry.name).toBe('settings.json');
    expect(entry.logicalKey).toBe('settings');
    expect(entry.updatedAt).toBe('2026-04-14T12:00:00.000Z');
    expect(entry.revision).toBe('42');
    expect(entry.size).toBe(256);
  });

  it('handles missing optional fields', () => {
    const raw: GoogleDriveFileRaw = {
      id: 'file-456',
      name: 'minimal.json',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.id).toBe('file-456');
    expect(entry.updatedAt).toBeUndefined();
    expect(entry.revision).toBeUndefined();
    expect(entry.size).toBeUndefined();
  });

  it('converts version to string', () => {
    const raw: GoogleDriveFileRaw = {
      id: 'f1',
      name: 'a.json',
      version: '7',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.revision).toBe('7');
    expect(typeof entry.revision).toBe('string');
  });

  it('converts size to number', () => {
    const raw: GoogleDriveFileRaw = {
      id: 'f2',
      name: 'b.json',
      size: '1024',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.size).toBe(1024);
  });

  it('uses the provided fileNameToKey function', () => {
    const raw: GoogleDriveFileRaw = {
      id: 'f3',
      name: 'my%20key.json',
    };
    const decodeFileNameToKey = (name: string) => decodeURIComponent(name.replace(/\.json$/, ''));
    const entry = toFileEntry(raw, decodeFileNameToKey);
    expect(entry.logicalKey).toBe('my key');
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd packages/provider-google-drive && npx vitest run src/__tests__/google-drive-mapper.test.ts`
Expected: FAIL — module `../google-drive-mapper.js` not found

---

### Task 3: Mapper — Implementation

**Files:**
- Create: `packages/provider-google-drive/src/google-drive-mapper.ts`

- [ ] **Step 8: Write the mapper implementation**

```ts
import type { FileEntry } from '@storage-bridge/core';

/**
 * Shape of a Google Drive file resource from the v3 API.
 * Only the fields we use are declared.
 */
export interface GoogleDriveFileRaw {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  version?: string;
}

/**
 * Convert a raw Google Drive API file resource to a FileEntry.
 * Pure function — no side effects, no dependencies.
 */
export function toFileEntry(
  raw: GoogleDriveFileRaw,
  fileNameToKey: (name: string) => string,
): FileEntry {
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

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd packages/provider-google-drive && npx vitest run src/__tests__/google-drive-mapper.test.ts`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add packages/provider-google-drive/src/google-drive-mapper.ts packages/provider-google-drive/src/__tests__/google-drive-mapper.test.ts
git commit -m "feat(provider-google-drive): add google-drive-mapper with tests"
```

---

### Task 4: Google Drive API Mock

**Files:**
- Create: `packages/provider-google-drive/src/__tests__/google-drive-api-mock.ts`

- [ ] **Step 11: Write the Drive API mock helper**

This mock simulates the Google Drive API v3 endpoints needed by the provider. It maintains an in-memory store of files, handles multipart upload parsing, and tracks file versions.

```ts
import type { GoogleDriveFileRaw } from '../google-drive-mapper.js';

interface MockFile {
  id: string;
  name: string;
  content: string;
  mimeType: string;
  modifiedTime: string;
  version: number;
  trashed: boolean;
}

let nextId = 1;

function generateId(): string {
  return `mock-file-${nextId++}`;
}

/**
 * Create a mock fetch function that simulates Google Drive API v3 endpoints.
 * Supports: files.list, files.get (metadata + alt=media), file creation (multipart),
 * file update (media PATCH), file deletion.
 */
export function createDriveApiMock() {
  const files = new Map<string, MockFile>();

  function reset(): void {
    files.clear();
    nextId = 1;
  }

  function getFilesByName(name: string): MockFile[] {
    return Array.from(files.values()).filter(
      f => f.name === name && !f.trashed,
    );
  }

  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    const path = url.pathname;
    const method = init?.method ?? 'GET';

    // Auth check
    const authHeader = (init?.headers as Record<string, string>)?.['Authorization'];
    if (!authHeader?.startsWith('Bearer test-token')) {
      return new Response(JSON.stringify({ error: { code: 401 } }), { status: 401 });
    }

    // files.list
    if (path.endsWith('/files') && !path.includes('upload') && method === 'GET') {
      const spaces = url.searchParams.get('spaces');
      const q = url.searchParams.get('q') ?? '';
      let results = Array.from(files.values()).filter(f => !f.trashed);

      // Parse name filter from query
      const nameMatch = q.match(/name='([^']+)'/);
      if (nameMatch) {
        results = results.filter(f => f.name === nameMatch[1]);
      }

      const responseFiles: GoogleDriveFileRaw[] = results.map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: String(f.content.length),
        modifiedTime: f.modifiedTime,
        version: String(f.version),
      }));

      return new Response(JSON.stringify({ files: responseFiles }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // File creation (multipart upload)
    if (path.endsWith('/files') && path.includes('upload') && method === 'POST') {
      const body = init?.body as string;
      const boundaryMatch = body.match(/--([^\r\n]+)/);
      const boundary = boundaryMatch ? boundaryMatch[1] : '';

      const parts = body.split(`--${boundary}`);
      let metadata: Record<string, unknown> = {};
      let content = '';

      for (const part of parts) {
        if (part.includes('application/json; charset=UTF-8') && !part.includes('"data"')) {
          const jsonStr = part.split('\r\n\r\n')[1]?.replace(/\r\n--.*/, '').trim();
          if (jsonStr) metadata = JSON.parse(jsonStr);
        } else if (part.includes('application/json') && part.includes('"data"')) {
          content = part.split('\r\n\r\n')[1]?.replace(/\r\n--.*/, '').trim() ?? '';
        }
      }

      const id = generateId();
      const file: MockFile = {
        id,
        name: metadata.name as string,
        content,
        mimeType: 'application/json',
        modifiedTime: new Date().toISOString(),
        version: 1,
        trashed: false,
      };
      files.set(id, file);

      return new Response(JSON.stringify({
        id: file.id,
        name: file.name,
        modifiedTime: file.modifiedTime,
        version: String(file.version),
        size: String(file.content.length),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // File-specific operations (need file ID)
    const fileIdMatch = path.match(/\/files\/([^/?]+)/);
    if (!fileIdMatch) {
      return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
    }
    const fileId = fileIdMatch[1];
    const file = files.get(fileId);

    // files.get with alt=media (download)
    if (method === 'GET' && url.searchParams.get('alt') === 'media') {
      if (!file || file.trashed) {
        return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
      }
      return new Response(file.content, { status: 200 });
    }

    // files.get metadata
    if (method === 'GET') {
      if (!file || file.trashed) {
        return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
      }
      return new Response(JSON.stringify({
        id: file.id,
        name: file.name,
        modifiedTime: file.modifiedTime,
        version: String(file.version),
        size: String(file.content.length),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // files.update (media upload)
    if (method === 'PATCH' || method === 'PUT') {
      if (!file || file.trashed) {
        return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
      }
      file.content = init?.body as string;
      file.version += 1;
      file.modifiedTime = new Date().toISOString();

      return new Response(JSON.stringify({
        id: file.id,
        name: file.name,
        modifiedTime: file.modifiedTime,
        version: String(file.version),
        size: String(file.content.length),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // files.delete
    if (method === 'DELETE') {
      if (!file) {
        return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
      }
      file.trashed = true;
      return new Response('', { status: 204 });
    }

    return new Response(JSON.stringify({ error: { code: 400 } }), { status: 400 });
  };

  return { mockFetch, reset, files };
}
```

- [ ] **Step 12: Commit**

```bash
git add packages/provider-google-drive/src/__tests__/google-drive-api-mock.ts
git commit -m "test(provider-google-drive): add Google Drive API mock helper"
```

---

### Task 5: Provider — Failing Tests

**Files:**
- Create: `packages/provider-google-drive/src/__tests__/google-drive-provider.test.ts`

- [ ] **Step 13: Write the failing provider tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GoogleDriveProvider } from '../google-drive-provider.js';
import { createDriveApiMock } from './google-drive-api-mock.js';
import type { OAuthClient, OAuthTokens } from '@storage-bridge/auth-web';
import { ConflictError, AuthRequiredError } from '@storage-bridge/core';

function createFakeOAuthClient(): OAuthClient {
  const tokens: OAuthTokens = {
    accessToken: 'test-token',
    tokenType: 'Bearer',
    expiresAt: Date.now() + 3600000,
  };
  return {
    login: async () => {},
    logout: async () => {},
    getAccessToken: async () => tokens.accessToken,
    getTokens: async () => tokens,
    getAuthHeaders: async () => ({ Authorization: `Bearer ${tokens.accessToken}` }),
  };
}

function createProvider() {
  const api = createDriveApiMock();
  const auth = createFakeOAuthClient();
  const provider = new GoogleDriveProvider({ auth, fetchFn: api.mockFetch as typeof fetch });
  return { provider, api, auth };
}

describe('GoogleDriveProvider', () => {
  describe('lifecycle', () => {
    it('delegates connect to auth.login', async () => {
      let loginCalled = false;
      const auth: OAuthClient = {
        login: async () => { loginCalled = true; },
        logout: async () => {},
        getAccessToken: async () => 'token',
        getTokens: async () => ({ accessToken: 'token', tokenType: 'Bearer' }),
        getAuthHeaders: async () => ({ Authorization: 'Bearer token' }),
      };
      const provider = new GoogleDriveProvider({ auth, fetchFn: (() => {}) as typeof fetch });
      await provider.connect();
      expect(loginCalled).toBe(true);
    });

    it('delegates disconnect to auth.logout', async () => {
      let logoutCalled = false;
      const auth: OAuthClient = {
        login: async () => {},
        logout: async () => { logoutCalled = true; },
        getAccessToken: async () => 'token',
        getTokens: async () => null,
        getAuthHeaders: async () => ({ Authorization: 'Bearer token' }),
      };
      const provider = new GoogleDriveProvider({ auth, fetchFn: (() => {}) as typeof fetch });
      await provider.disconnect();
      expect(logoutCalled).toBe(true);
    });

    it('isConnected returns true when tokens exist', async () => {
      const { provider } = createProvider();
      expect(await provider.isConnected()).toBe(true);
    });

    it('isConnected returns false when tokens are null', async () => {
      const auth: OAuthClient = {
        login: async () => {},
        logout: async () => {},
        getAccessToken: async () => { throw new Error('no tokens'); },
        getTokens: async () => null,
        getAuthHeaders: async () => ({ Authorization: 'Bearer token' }),
      };
      const provider = new GoogleDriveProvider({ auth, fetchFn: (() => {}) as typeof fetch });
      expect(await provider.isConnected()).toBe(false);
    });

    it('getProfile returns profile with provider id when connected', async () => {
      const { provider } = createProvider();
      const profile = await provider.getProfile();
      expect(profile).not.toBeNull();
      expect(profile!.provider).toBe('google-drive');
    });

    it('getProfile returns null when no tokens', async () => {
      const auth: OAuthClient = {
        login: async () => {},
        logout: async () => {},
        getAccessToken: async () => { throw new Error('no tokens'); },
        getTokens: async () => null,
        getAuthHeaders: async () => ({ Authorization: 'Bearer token' }),
      };
      const provider = new GoogleDriveProvider({ auth, fetchFn: (() => {}) as typeof fetch });
      expect(await provider.getProfile()).toBeNull();
    });
  });

  describe('CRUD via FileBackedDocumentProvider', () => {
    beforeEach(() => {
      // Reset is handled by creating fresh provider per test
    });

    it('listFiles returns empty when no files exist', async () => {
      const { provider } = createProvider();
      const files = await provider.listFiles();
      expect(files).toEqual([]);
    });

    it('writeFile creates a new file and readFile retrieves it', async () => {
      const { provider } = createProvider();
      const meta = await provider.writeFile('test-key.json', '{"data":true}');
      expect(meta.id).toBeDefined();
      expect(meta.revision).toBeDefined();

      const result = await provider.readFile('test-key.json');
      expect(result).not.toBeNull();
      expect(result!.text).toBe('{"data":true}');
      expect(result!.meta.revision).toBe(meta.revision);
    });

    it('writeFile updates an existing file', async () => {
      const { provider } = createProvider();
      const v1 = await provider.writeFile('cfg.json', '{"v":1}');
      const v2 = await provider.writeFile('cfg.json', '{"v":2}');
      expect(v2.revision).not.toBe(v1.revision);

      const result = await provider.readFile('cfg.json');
      expect(result!.text).toBe('{"v":2}');
    });

    it('removeFile deletes a file', async () => {
      const { provider } = createProvider();
      await provider.writeFile('del.json', '{}');
      await provider.removeFile('del.json');
      const result = await provider.readFile('del.json');
      expect(result).toBeNull();
    });

    it('removeFile is no-op for missing file', async () => {
      const { provider } = createProvider();
      await expect(provider.removeFile('nonexistent.json')).resolves.toBeUndefined();
    });

    it('listFiles returns all stored files', async () => {
      const { provider } = createProvider();
      await provider.writeFile('a.json', '{}');
      await provider.writeFile('b.json', '{}');
      const files = await provider.listFiles();
      expect(files).toHaveLength(2);
      const keys = files.map(f => f.name).sort();
      expect(keys).toEqual(['a.json', 'b.json']);
    });
  });

  describe('optimistic concurrency', () => {
    it('writeFile with matching expectedRevision succeeds', async () => {
      const { provider } = createProvider();
      const v1 = await provider.writeFile('conflict.json', '{"v":1}');
      const v2 = await provider.writeFile('conflict.json', '{"v":2}', {
        expectedRevision: v1.revision,
      });
      expect(v2.revision).toBeDefined();
    });

    it('writeFile with mismatched expectedRevision throws ConflictError', async () => {
      const { provider } = createProvider();
      await provider.writeFile('conflict.json', '{"v":1}');
      await expect(
        provider.writeFile('conflict.json', '{"v":2}', { expectedRevision: 'wrong-revision' }),
      ).rejects.toThrow(ConflictError);
    });

    it('writeFile with expectedRevision but no existing file throws ConflictError', async () => {
      const { provider } = createProvider();
      await expect(
        provider.writeFile('new.json', '{}', { expectedRevision: 'any-revision' }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('error handling', () => {
    it('throws AuthRequiredError on 401', async () => {
      const auth: OAuthClient = {
        login: async () => {},
        logout: async () => {},
        getAccessToken: async () => 'bad-token',
        getTokens: async () => ({ accessToken: 'bad-token', tokenType: 'Bearer' }),
        getAuthHeaders: async () => ({ Authorization: 'Bearer bad-token' }),
      };
      const { mockFetch } = createDriveApiMock();
      const provider = new GoogleDriveProvider({ auth, fetchFn: mockFetch as typeof fetch });
      await expect(provider.listFiles()).rejects.toThrow(AuthRequiredError);
    });

    it('readFile returns null for 404', async () => {
      const { provider } = createProvider();
      const result = await provider.readFile('nonexistent.json');
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 14: Run tests to verify they fail**

Run: `cd packages/provider-google-drive && npx vitest run src/__tests__/google-drive-provider.test.ts`
Expected: FAIL — module `../google-drive-provider.js` not found

---

### Task 6: Provider — Implementation

**Files:**
- Create: `packages/provider-google-drive/src/google-drive-provider.ts`

- [ ] **Step 15: Write the GoogleDriveProvider implementation**

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

- [ ] **Step 16: Run provider tests to verify they pass**

Run: `cd packages/provider-google-drive && npx vitest run src/__tests__/google-drive-provider.test.ts`
Expected: ALL PASS

- [ ] **Step 17: Commit**

```bash
git add packages/provider-google-drive/src/google-drive-provider.ts packages/provider-google-drive/src/__tests__/google-drive-provider.test.ts
git commit -m "feat(provider-google-drive): add GoogleDriveProvider with tests"
```

---

### Task 7: Contract Tests

**Files:**
- Create: `packages/provider-google-drive/src/__tests__/google-drive-contract.test.ts`

- [ ] **Step 18: Write the contract conformance tests**

```ts
import { describeProviderContract } from '@storage-bridge/testing';
import { GoogleDriveProvider } from '../google-drive-provider.js';
import { createDriveApiMock } from './google-drive-api-mock.js';
import type { OAuthClient } from '@storage-bridge/auth-web';

function createContractProvider(): GoogleDriveProvider {
  const api = createDriveApiMock();
  const auth: OAuthClient = {
    login: async () => {},
    logout: async () => {},
    getAccessToken: async () => 'test-token',
    getTokens: async () => ({ accessToken: 'test-token', tokenType: 'Bearer', expiresAt: Date.now() + 3600000 }),
    getAuthHeaders: async () => ({ Authorization: 'Bearer test-token' }),
  };
  return new GoogleDriveProvider({ auth, fetchFn: api.mockFetch as typeof fetch });
}

describeProviderContract('GoogleDriveProvider', createContractProvider);
```

- [ ] **Step 19: Run contract tests to verify they pass**

Run: `cd packages/provider-google-drive && npx vitest run src/__tests__/google-drive-contract.test.ts`
Expected: ALL PASS

- [ ] **Step 20: Commit**

```bash
git add packages/provider-google-drive/src/__tests__/google-drive-contract.test.ts
git commit -m "test(provider-google-drive): add provider contract conformance tests"
```

---

### Task 8: Barrel Export and Final Verification

**Files:**
- Create: `packages/provider-google-drive/src/index.ts`

- [ ] **Step 21: Create the barrel export**

```ts
export * from './google-drive-mapper.js';
export * from './google-drive-provider.js';
```

- [ ] **Step 22: Run full test suite**

Run: `cd packages/provider-google-drive && npx vitest run`
Expected: ALL PASS

- [ ] **Step 23: Run typecheck**

Run: `cd packages/provider-google-drive && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 24: Commit**

```bash
git add packages/provider-google-drive/src/index.ts
git commit -m "feat(provider-google-drive): add barrel export"
```

---

## Acceptance Criteria Mapping

| AC | Task |
|----|------|
| #1 Extends FileBackedDocumentProvider | Task 6: `GoogleDriveProvider extends FileBackedDocumentProvider` |
| #2 Uses appDataFolder with drive.appdata scope | Task 6: `parents: ['appDataFolder']`, `spaces=appDataFolder` |
| #3 Multipart upload for create, PATCH for update | Task 6: `createFile` multipart, `updateFile` media PATCH |
| #4 Delegates auth to injected OAuthClient | Task 6: Constructor injection, `auth.getAuthHeaders()` |
| #5 google-drive-mapper.ts maps API responses to FileEntry | Task 3: `toFileEntry()` in dedicated module |
| #6 Passes provider contract tests | Task 7: `describeProviderContract` runs against mock |
| #7 Unit tests with mocked fetch | Tasks 2–6: All tests use `createDriveApiMock()` |