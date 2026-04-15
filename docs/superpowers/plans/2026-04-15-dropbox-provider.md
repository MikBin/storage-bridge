# Dropbox Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `packages/provider-dropbox` extending `FileBackedDocumentProvider` with Dropbox API v2 integration, App Folder storage, and full test coverage.

**Architecture:** `DropboxProvider` extends `FileBackedDocumentProvider`, implementing file primitives via Dropbox API v2 content and RPC endpoints. `dropbox-mapper.ts` maps raw Dropbox API responses to `FileEntry`. Auth delegated to injected `OAuthClient`. Tests use mocked `fetchFn`.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo, `@storage-bridge/core`, `@storage-bridge/auth-web`

**Spec:** `docs/superpowers/specs/2026-04-15-dropbox-provider-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/provider-dropbox/package.json` | Create | Package manifest |
| `packages/provider-dropbox/tsconfig.json` | Create | TypeScript config |
| `packages/provider-dropbox/vitest.config.ts` | Create | Vitest config |
| `packages/provider-dropbox/src/dropbox-mapper.ts` | Create | `DropboxFileRaw` type + `toFileEntry()` |
| `packages/provider-dropbox/src/__tests__/dropbox-mapper.test.ts` | Create | Mapper unit tests |
| `packages/provider-dropbox/src/dropbox-provider.ts` | Create | `DropboxProvider` class |
| `packages/provider-dropbox/src/__tests__/dropbox-provider.test.ts` | Create | Provider unit tests with mocked fetch |
| `packages/provider-dropbox/src/__tests__/dropbox-api-mock.ts` | Create | Shared Dropbox API mock for unit + contract tests |
| `packages/provider-dropbox/src/__tests__/dropbox-contract.test.ts` | Create | Contract conformance tests |
| `packages/provider-dropbox/src/index.ts` | Create | Barrel re-export |

---

### Task 1: Package Scaffold

**Files:**
- Create: `packages/provider-dropbox/package.json`
- Create: `packages/provider-dropbox/tsconfig.json`
- Create: `packages/provider-dropbox/vitest.config.ts`

- [ ] **Step 1: Create `packages/provider-dropbox/package.json`**

```json
{
  "name": "@storage-bridge/provider-dropbox",
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

- [ ] **Step 2: Create `packages/provider-dropbox/tsconfig.json`**

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

- [ ] **Step 3: Create `packages/provider-dropbox/vitest.config.ts`**

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
git add packages/provider-dropbox/package.json packages/provider-dropbox/tsconfig.json packages/provider-dropbox/vitest.config.ts
git commit -m "chore(provider-dropbox): scaffold package"
```

---

### Task 2: Mapper — Failing Tests

**Files:**
- Create: `packages/provider-dropbox/src/__tests__/dropbox-mapper.test.ts`

- [ ] **Step 6: Write the failing mapper tests**

```ts
import { describe, it, expect } from 'vitest';
import { toFileEntry, type DropboxFileRaw } from '../dropbox-mapper.js';

const defaultFileNameToKey = (name: string) => name.replace(/\.json$/, '');

describe('toFileEntry', () => {
  it('maps a full DropboxFileRaw to FileEntry', () => {
    const raw: DropboxFileRaw = {
      id: 'id:abc123',
      name: 'settings.json',
      '.tag': 'file',
      server_modified: '2026-04-15T12:00:00.000Z',
      rev: '0123456789',
      size: 256,
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.id).toBe('id:abc123');
    expect(entry.name).toBe('settings.json');
    expect(entry.logicalKey).toBe('settings');
    expect(entry.updatedAt).toBe('2026-04-15T12:00:00.000Z');
    expect(entry.revision).toBe('0123456789');
    expect(entry.size).toBe(256);
  });

  it('handles missing optional fields', () => {
    const raw: DropboxFileRaw = {
      id: 'id:xyz789',
      name: 'minimal.json',
      '.tag': 'file',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.id).toBe('id:xyz789');
    expect(entry.updatedAt).toBeUndefined();
    expect(entry.revision).toBeUndefined();
    expect(entry.size).toBeUndefined();
  });

  it('preserves rev as string', () => {
    const raw: DropboxFileRaw = {
      id: 'id:rev1',
      name: 'a.json',
      '.tag': 'file',
      rev: 'abcdef',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.revision).toBe('abcdef');
    expect(typeof entry.revision).toBe('string');
  });

  it('handles numeric size', () => {
    const raw: DropboxFileRaw = {
      id: 'id:size1',
      name: 'b.json',
      '.tag': 'file',
      size: 1024,
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.size).toBe(1024);
  });

  it('uses the provided fileNameToKey function', () => {
    const raw: DropboxFileRaw = {
      id: 'id:fn2k',
      name: 'my%20key.json',
      '.tag': 'file',
    };
    const decodeFileNameToKey = (name: string) => decodeURIComponent(name.replace(/\.json$/, ''));
    const entry = toFileEntry(raw, decodeFileNameToKey);
    expect(entry.logicalKey).toBe('my key');
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd packages/provider-dropbox && npx vitest run src/__tests__/dropbox-mapper.test.ts`
Expected: FAIL — module `../dropbox-mapper.js` not found

---

### Task 3: Mapper — Implementation

**Files:**
- Create: `packages/provider-dropbox/src/dropbox-mapper.ts`

- [ ] **Step 8: Write the mapper implementation**

```ts
import type { FileEntry } from '@storage-bridge/core';

/**
 * Shape of a Dropbox file metadata entry from the v2 API.
 * Only the fields we use are declared.
 */
export interface DropboxFileRaw {
  id: string;
  name: string;
  '.tag': string;
  server_modified?: string;
  rev?: string;
  size?: number;
}

/**
 * Convert a raw Dropbox API file metadata entry to a FileEntry.
 * Pure function — no side effects, no dependencies.
 */
export function toFileEntry(
  raw: DropboxFileRaw,
  fileNameToKey: (name: string) => string,
): FileEntry {
  return {
    id: raw.id,
    name: raw.name,
    logicalKey: fileNameToKey(raw.name),
    updatedAt: raw.server_modified,
    revision: raw.rev,
    size: raw.size,
  };
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd packages/provider-dropbox && npx vitest run src/__tests__/dropbox-mapper.test.ts`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add packages/provider-dropbox/src/dropbox-mapper.ts packages/provider-dropbox/src/__tests__/dropbox-mapper.test.ts
git commit -m "feat(provider-dropbox): add dropbox-mapper with tests"
```

---

### Task 4: Dropbox API Mock

**Files:**
- Create: `packages/provider-dropbox/src/__tests__/dropbox-api-mock.ts`

- [ ] **Step 11: Write the Dropbox API mock helper**

This mock simulates the Dropbox API v2 endpoints needed by the provider. It maintains an in-memory store of files and handles all four CRUD operations. The mock differentiates endpoints by URL: `content.dropboxapi.com` for download/upload, `api.dropboxapi.com` for delete/list.

```ts
import type { DropboxFileRaw } from '../dropbox-mapper.js';

interface MockFile {
  id: string;
  name: string;
  content: string;
  server_modified: string;
  rev: string;
  size: number;
  deleted: boolean;
}

let nextId = 1;
let nextRev = 1;

function generateId(): string {
  return `id:mock-${nextId++}`;
}

function generateRev(): string {
  return `rev-${nextRev++}`;
}

/**
 * Create a mock fetch function that simulates Dropbox API v2 endpoints.
 * Supports: /2/files/download, /2/files/upload, /2/files/delete_v2, /2/files/list_folder.
 */
export function createDropboxApiMock() {
  const files = new Map<string, MockFile>();

  function reset(): void {
    files.clear();
    nextId = 1;
    nextRev = 1;
  }

  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    const hostname = url.hostname;
    const path = url.pathname;
    const method = init?.method ?? 'GET';

    // Auth check
    const headers = init?.headers as Record<string, string> | undefined;
    const authHeader = headers?.['Authorization'];
    if (!authHeader?.startsWith('Bearer test-token')) {
      return new Response(JSON.stringify({ error_summary: 'invalid_access_token', error: {} }), { status: 401 });
    }

    // content.dropboxapi.com/2/files/download
    if (hostname === 'content.dropboxapi.com' && path === '/2/files/download' && method === 'POST') {
      const argHeader = headers?.['Dropbox-API-Arg'];
      if (!argHeader) {
        return new Response(JSON.stringify({ error_summary: 'bad_request', error: {} }), { status: 400 });
      }
      const arg = JSON.parse(argHeader);
      const filePath: string = arg.path;
      const fileName = filePath.replace(/^\//, '');
      const file = Array.from(files.values()).find(f => f.name === fileName && !f.deleted);

      if (!file) {
        return new Response(JSON.stringify({ error_summary: 'path/not_found', error: {} }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const meta: DropboxFileRaw = {
        id: file.id,
        name: file.name,
        '.tag': 'file',
        server_modified: file.server_modified,
        rev: file.rev,
        size: file.size,
      };

      return new Response(file.content, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Dropbox-API-Result': JSON.stringify(meta),
        },
      });
    }

    // content.dropboxapi.com/2/files/upload
    if (hostname === 'content.dropboxapi.com' && path === '/2/files/upload' && method === 'POST') {
      const argHeader = headers?.['Dropbox-API-Arg'];
      if (!argHeader) {
        return new Response(JSON.stringify({ error_summary: 'bad_request', error: {} }), { status: 400 });
      }
      const arg = JSON.parse(argHeader);
      const filePath: string = arg.path;
      const fileName = filePath.replace(/^\//, '');
      const body = (init?.body as string) ?? '';

      const existing = Array.from(files.values()).find(f => f.name === fileName && !f.deleted);

      if (existing) {
        existing.content = body;
        existing.rev = generateRev();
        existing.server_modified = new Date().toISOString();
        existing.size = body.length;
      } else {
        const id = generateId();
        const file: MockFile = {
          id,
          name: fileName,
          content: body,
          server_modified: new Date().toISOString(),
          rev: generateRev(),
          size: body.length,
          deleted: false,
        };
        files.set(id, file);
        // Return the newly created file metadata
        const result: DropboxFileRaw = {
          id: file.id,
          name: file.name,
          '.tag': 'file',
          server_modified: file.server_modified,
          rev: file.rev,
          size: file.size,
        };
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const result: DropboxFileRaw = {
        id: existing.id,
        name: existing.name,
        '.tag': 'file',
        server_modified: existing.server_modified,
        rev: existing.rev,
        size: existing.size,
      };
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // api.dropboxapi.com/2/files/delete_v2
    if (hostname === 'api.dropboxapi.com' && path === '/2/files/delete_v2' && method === 'POST') {
      const body = JSON.parse((init?.body as string) ?? '{}');
      const filePath: string = body.path;
      const fileName = filePath.replace(/^\//, '');
      const file = Array.from(files.values()).find(f => f.name === fileName && !f.deleted);

      if (!file) {
        return new Response(JSON.stringify({ error_summary: 'path/not_found', error: {} }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      file.deleted = true;
      const result: DropboxFileRaw = {
        id: file.id,
        name: file.name,
        '.tag': 'file',
        server_modified: file.server_modified,
        rev: file.rev,
        size: file.size,
      };
      return new Response(JSON.stringify({ metadata: result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // api.dropboxapi.com/2/files/list_folder
    if (hostname === 'api.dropboxapi.com' && path === '/2/files/list_folder' && method === 'POST') {
      const activeFiles = Array.from(files.values()).filter(f => !f.deleted);
      const entries: DropboxFileRaw[] = activeFiles.map(f => ({
        id: f.id,
        name: f.name,
        '.tag': 'file',
        server_modified: f.server_modified,
        rev: f.rev,
        size: f.size,
      }));

      return new Response(JSON.stringify({ entries }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error_summary: 'unknown_endpoint', error: {} }), { status: 400 });
  };

  return { mockFetch, reset, files };
}
```

- [ ] **Step 12: Commit**

```bash
git add packages/provider-dropbox/src/__tests__/dropbox-api-mock.ts
git commit -m "test(provider-dropbox): add Dropbox API mock helper"
```

---

### Task 5: Provider — Failing Tests

**Files:**
- Create: `packages/provider-dropbox/src/__tests__/dropbox-provider.test.ts`

- [ ] **Step 13: Write the failing provider tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DropboxProvider } from '../dropbox-provider.js';
import { createDropboxApiMock } from './dropbox-api-mock.js';
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
  const api = createDropboxApiMock();
  const auth = createFakeOAuthClient();
  const provider = new DropboxProvider({ auth, fetchFn: api.mockFetch as typeof fetch });
  return { provider, api, auth };
}

describe('DropboxProvider', () => {
  describe('lifecycle', () => {
    it('delegates connect to auth.login', async () => {
      let loginCalled = false;
      const auth: OAuthClient = {
        login: async () => { loginCalled = true; },
        logout: async () => {},
        getAccessToken: async () => 'token',
        getTokens: async () => ({ accessToken: 'token', tokenType: 'Bearer', expiresAt: Date.now() + 3600000 }),
        getAuthHeaders: async () => ({ Authorization: 'Bearer token' }),
      };
      const provider = new DropboxProvider({ auth, fetchFn: (() => {}) as typeof fetch });
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
      const provider = new DropboxProvider({ auth, fetchFn: (() => {}) as typeof fetch });
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
      const provider = new DropboxProvider({ auth, fetchFn: (() => {}) as typeof fetch });
      expect(await provider.isConnected()).toBe(false);
    });

    it('getProfile returns profile with provider id when connected', async () => {
      const { provider } = createProvider();
      const profile = await provider.getProfile();
      expect(profile).not.toBeNull();
      expect(profile!.provider).toBe('dropbox');
    });

    it('getProfile returns null when no tokens', async () => {
      const auth: OAuthClient = {
        login: async () => {},
        logout: async () => {},
        getAccessToken: async () => { throw new Error('no tokens'); },
        getTokens: async () => null,
        getAuthHeaders: async () => ({ Authorization: 'Bearer token' }),
      };
      const provider = new DropboxProvider({ auth, fetchFn: (() => {}) as typeof fetch });
      expect(await provider.getProfile()).toBeNull();
    });
  });

  describe('CRUD via FileBackedDocumentProvider', () => {
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
        getTokens: async () => ({ accessToken: 'bad-token', tokenType: 'Bearer', expiresAt: Date.now() + 3600000 }),
        getAuthHeaders: async () => ({ Authorization: 'Bearer bad-token' }),
      };
      const { mockFetch } = createDropboxApiMock();
      const provider = new DropboxProvider({ auth, fetchFn: mockFetch as typeof fetch });
      await expect(provider.listFiles()).rejects.toThrow(AuthRequiredError);
    });

    it('readFile returns null for missing file', async () => {
      const { provider } = createProvider();
      const result = await provider.readFile('nonexistent.json');
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 14: Run tests to verify they fail**

Run: `cd packages/provider-dropbox && npx vitest run src/__tests__/dropbox-provider.test.ts`
Expected: FAIL — module `../dropbox-provider.js` not found

---

### Task 6: Provider — Implementation

**Files:**
- Create: `packages/provider-dropbox/src/dropbox-provider.ts`

- [ ] **Step 15: Write the DropboxProvider implementation**

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

  constructor(options: DropboxProviderOptions) {
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
    const raw = JSON.parse(metaHeader) as DropboxFileRaw;
    return { text: await res.text(), meta: toFileEntry(raw, (n) => this.fileNameToKey(n)) };
  }

  public async writeFile(fileName: string, body: string, options?: PutOptions): Promise<FileEntry> {
    const existing = await this.findFileByName(fileName);

    if (options?.expectedRevision !== undefined) {
      if (!existing || existing.revision !== options.expectedRevision) {
        throw new ConflictError(fileName);
      }
    }

    const res = await this.fetchFn(`${CONTENT_BASE}/2/files/upload`, {
      method: 'POST',
      headers: {
        ...(await this.auth.getAuthHeaders()),
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: `/${fileName}`, mode: 'overwrite', mute: true }),
      },
      body,
    });

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
    const res = await this.fetchFn(`${API_BASE}/2/files/list_folder`, {
      method: 'POST',
      headers: {
        ...(await this.auth.getAuthHeaders()),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: '' }),
    });

    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(this.id);
    if (!res.ok) throw new SettingsStoreError(`Dropbox list failed: ${res.status}`, 'DROPBOX_LIST_ERROR');

    const json = await res.json() as { entries?: DropboxFileRaw[] };
    return (json.entries ?? [])
      .filter(e => e['.tag'] === 'file')
      .map(e => toFileEntry(e, (n) => this.fileNameToKey(n)));
  }

  private async findFileByName(name: string): Promise<FileEntry | null> {
    const files = await this.listFiles();
    return files.find(f => f.name === name) ?? null;
  }
}
```

- [ ] **Step 16: Run provider tests to verify they pass**

Run: `cd packages/provider-dropbox && npx vitest run src/__tests__/dropbox-provider.test.ts`
Expected: ALL PASS

- [ ] **Step 17: Commit**

```bash
git add packages/provider-dropbox/src/dropbox-provider.ts packages/provider-dropbox/src/__tests__/dropbox-provider.test.ts
git commit -m "feat(provider-dropbox): add DropboxProvider with tests"
```

---

### Task 7: Contract Tests

**Files:**
- Create: `packages/provider-dropbox/src/__tests__/dropbox-contract.test.ts`

- [ ] **Step 18: Write the contract conformance tests**

```ts
import { describeProviderContract } from '@storage-bridge/testing';
import { DropboxProvider } from '../dropbox-provider.js';
import { createDropboxApiMock } from './dropbox-api-mock.js';
import type { OAuthClient } from '@storage-bridge/auth-web';

function createContractProvider(): DropboxProvider {
  const api = createDropboxApiMock();
  api.reset();

  const auth: OAuthClient = {
    login: async () => {},
    logout: async () => {},
    getAccessToken: async () => 'test-token',
    getTokens: async () => ({ accessToken: 'test-token', tokenType: 'Bearer', expiresAt: Date.now() + 3600000 }),
    getAuthHeaders: async () => ({ Authorization: 'Bearer test-token' }),
  };

  return new DropboxProvider({ auth, fetchFn: api.mockFetch as typeof fetch });
}

describeProviderContract('DropboxProvider', createContractProvider);
```

- [ ] **Step 19: Run contract tests to verify they pass**

Run: `cd packages/provider-dropbox && npx vitest run src/__tests__/dropbox-contract.test.ts`
Expected: ALL PASS

- [ ] **Step 20: Commit**

```bash
git add packages/provider-dropbox/src/__tests__/dropbox-contract.test.ts
git commit -m "test(provider-dropbox): add provider contract conformance tests"
```

---

### Task 8: Barrel Export and Final Verification

**Files:**
- Create: `packages/provider-dropbox/src/index.ts`

- [ ] **Step 21: Create the barrel export**

```ts
export * from './dropbox-mapper.js';
export * from './dropbox-provider.js';
```

- [ ] **Step 22: Run full test suite**

Run: `cd packages/provider-dropbox && npx vitest run`
Expected: ALL PASS

- [ ] **Step 23: Run typecheck**

Run: `cd packages/provider-dropbox && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 24: Commit**

```bash
git add packages/provider-dropbox/src/index.ts
git commit -m "feat(provider-dropbox): add barrel export"
```

---

## Acceptance Criteria Mapping

| AC | Task |
|----|------|
| #1 Extends FileBackedDocumentProvider | Task 6: `DropboxProvider extends FileBackedDocumentProvider` |
| #2 Read via /2/files/download with Dropbox-API-Arg header | Task 6: `readFile` uses `Dropbox-API-Arg` header, parses `Dropbox-API-Result` response header |
| #3 Write via /2/files/upload with mode: overwrite | Task 6: `writeFile` uses `mode: 'overwrite'` in `Dropbox-API-Arg` header |
| #4 Delete via /2/files/delete_v2 | Task 6: `removeFile` POSTs to `api.dropboxapi.com/2/files/delete_v2` |
| #5 List via /2/files/list_folder filtering to file entries | Task 6: `listFiles` filters entries where `.tag === 'file'` |
| #6 Parses metadata from Dropbox-API-Result response header | Task 6: `readFile` parses `Dropbox-API-Result` header for metadata |
| #7 Passes provider contract tests | Task 7: `describeProviderContract` runs against mock |
| #8 Unit tests with mocked fetch | Tasks 2–6: All tests use `createDropboxApiMock()` |