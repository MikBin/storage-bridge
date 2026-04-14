# OneDrive Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `packages/provider-onedrive` extending `FileBackedDocumentProvider` with Microsoft Graph API v1.0 integration, app folder storage via `/special/approot`, native `If-Match` optimistic concurrency, and full test coverage.

**Architecture:** `OneDriveProvider` extends `FileBackedDocumentProvider`, implementing file primitives via Microsoft Graph API v1.0. `onedrive-mapper.ts` maps raw DriveItem responses to `FileEntry`. Auth delegated to injected `OAuthClient`. OneDrive uses path-based addressing (simpler than Google Drive's ID-based approach) and native `If-Match` / `412` for optimistic concurrency.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo, `@storage-bridge/core`, `@storage-bridge/auth-web`

**Spec:** `docs/superpowers/specs/2026-04-14-onedrive-provider-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/provider-onedrive/package.json` | Create | Package manifest |
| `packages/provider-onedrive/tsconfig.json` | Create | TypeScript config |
| `packages/provider-onedrive/vitest.config.ts` | Create | Vitest config |
| `packages/provider-onedrive/src/onedrive-mapper.ts` | Create | `OneDriveItemRaw` type + `toFileEntry()` |
| `packages/provider-onedrive/src/__tests__/onedrive-mapper.test.ts` | Create | Mapper unit tests |
| `packages/provider-onedrive/src/onedrive-provider.ts` | Create | `OneDriveProvider` class |
| `packages/provider-onedrive/src/__tests__/onedrive-provider.test.ts` | Create | Provider unit tests with mocked fetch |
| `packages/provider-onedrive/src/__tests__/onedrive-api-mock.ts` | Create | Shared Graph API mock for unit + contract tests |
| `packages/provider-onedrive/src/__tests__/onedrive-contract.test.ts` | Create | Contract conformance tests |
| `packages/provider-onedrive/src/index.ts` | Create | Barrel re-export |

---

### Task 1: Package Scaffold

**Files:**
- Create: `packages/provider-onedrive/package.json`
- Create: `packages/provider-onedrive/tsconfig.json`
- Create: `packages/provider-onedrive/vitest.config.ts`

- [ ] **Step 1: Create `packages/provider-onedrive/package.json`**

```json
{
  "name": "@storage-bridge/provider-onedrive",
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

- [ ] **Step 2: Create `packages/provider-onedrive/tsconfig.json`**

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

- [ ] **Step 3: Create `packages/provider-onedrive/vitest.config.ts`**

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
git add packages/provider-onedrive/package.json packages/provider-onedrive/tsconfig.json packages/provider-onedrive/vitest.config.ts
git commit -m "chore(provider-onedrive): scaffold package"
```

---

### Task 2: Mapper — Failing Tests

**Files:**
- Create: `packages/provider-onedrive/src/__tests__/onedrive-mapper.test.ts`

- [ ] **Step 6: Write the failing mapper tests**

```ts
import { describe, it, expect } from 'vitest';
import { toFileEntry, type OneDriveItemRaw } from '../onedrive-mapper.js';

const defaultFileNameToKey = (name: string) => name.replace(/\.json$/, '');

describe('toFileEntry', () => {
  it('maps a full OneDriveItemRaw to FileEntry', () => {
    const raw: OneDriveItemRaw = {
      id: 'item-123',
      name: 'settings.json',
      lastModifiedDateTime: '2026-04-14T12:00:00.000Z',
      eTag: '"{{etag-abc}}"',
      cTag: '"{{ctag-xyz}}"',
      size: 256,
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.id).toBe('item-123');
    expect(entry.name).toBe('settings.json');
    expect(entry.logicalKey).toBe('settings');
    expect(entry.updatedAt).toBe('2026-04-14T12:00:00.000Z');
    expect(entry.revision).toBe('"{{etag-abc}}"');
    expect(entry.size).toBe(256);
  });

  it('handles missing optional fields', () => {
    const raw: OneDriveItemRaw = {
      id: 'item-456',
      name: 'minimal.json',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.id).toBe('item-456');
    expect(entry.updatedAt).toBeUndefined();
    expect(entry.revision).toBeUndefined();
    expect(entry.size).toBeUndefined();
  });

  it('uses eTag as revision, falling back to cTag', () => {
    const withBoth: OneDriveItemRaw = {
      id: 'f1',
      name: 'a.json',
      eTag: '"etag-value"',
      cTag: '"ctag-value"',
    };
    expect(toFileEntry(withBoth, defaultFileNameToKey).revision).toBe('"etag-value"');

    const withOnlyCTag: OneDriveItemRaw = {
      id: 'f2',
      name: 'b.json',
      cTag: '"ctag-only"',
    };
    expect(toFileEntry(withOnlyCTag, defaultFileNameToKey).revision).toBe('"ctag-only"');

    const withNeither: OneDriveItemRaw = {
      id: 'f3',
      name: 'c.json',
    };
    expect(toFileEntry(withNeither, defaultFileNameToKey).revision).toBeUndefined();
  });

  it('handles numeric size', () => {
    const raw: OneDriveItemRaw = {
      id: 'f4',
      name: 'd.json',
      size: 1024,
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.size).toBe(1024);
    expect(typeof entry.size).toBe('number');
  });

  it('uses the provided fileNameToKey function', () => {
    const raw: OneDriveItemRaw = {
      id: 'f5',
      name: 'my%20key.json',
    };
    const decodeFileNameToKey = (name: string) => decodeURIComponent(name.replace(/\.json$/, ''));
    const entry = toFileEntry(raw, decodeFileNameToKey);
    expect(entry.logicalKey).toBe('my key');
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd packages/provider-onedrive; npx vitest run src/__tests__/onedrive-mapper.test.ts`
Expected: FAIL — module `../onedrive-mapper.js` not found

---

### Task 3: Mapper — Implementation

**Files:**
- Create: `packages/provider-onedrive/src/onedrive-mapper.ts`

- [ ] **Step 8: Write the mapper implementation**

```ts
import type { FileEntry } from '@storage-bridge/core';

/**
 * Shape of a Microsoft Graph DriveItem resource.
 * Only the fields we use are declared.
 */
export interface OneDriveItemRaw {
  id: string;
  name: string;
  lastModifiedDateTime?: string;
  eTag?: string;
  cTag?: string;
  size?: number;
}

/**
 * Convert a raw Microsoft Graph DriveItem to a FileEntry.
 * Pure function — no side effects, no dependencies.
 */
export function toFileEntry(
  raw: OneDriveItemRaw,
  fileNameToKey: (name: string) => string,
): FileEntry {
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

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd packages/provider-onedrive; npx vitest run src/__tests__/onedrive-mapper.test.ts`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add packages/provider-onedrive/src/onedrive-mapper.ts packages/provider-onedrive/src/__tests__/onedrive-mapper.test.ts
git commit -m "feat(provider-onedrive): add onedrive-mapper with tests"
```

---

### Task 4: OneDrive API Mock

**Files:**
- Create: `packages/provider-onedrive/src/__tests__/onedrive-api-mock.ts`

- [ ] **Step 11: Write the Graph API mock helper**

This mock simulates the Microsoft Graph API v1.0 endpoints needed by the provider. It maintains an in-memory store of files, handles path-based addressing, tracks ETags, and supports `If-Match` conditional requests.

```ts
import type { OneDriveItemRaw } from '../onedrive-mapper.js';

interface MockFile {
  id: string;
  name: string;
  content: string;
  eTag: string;
  cTag: string;
  lastModifiedDateTime: string;
  size: number;
}

let nextId = 1;
let nextETag = 1;

function generateId(): string {
  return `mock-item-${nextId++}`;
}

function generateETag(): string {
  return `"{{etag-${nextETag++}}}"`;
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';

/**
 * Create a mock fetch function that simulates Microsoft Graph API v1.0 endpoints
 * for the OneDrive app folder.
 *
 * Supports:
 * - GET .../content — download file content
 * - GET .../children — list files
 * - GET item metadata (without :/content)
 * - PUT .../content — create or update file content
 * - DELETE item
 * - If-Match header → 412 on mismatch
 */
export function createOneDriveApiMock() {
  const files = new Map<string, MockFile>();

  function reset(): void {
    files.clear();
    nextId = 1;
    nextETag = 1;
  }

  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    const path = url.pathname;
    const method = init?.method ?? 'GET';

    // Auth check
    const authHeader = (init?.headers as Record<string, string>)?.['Authorization'];
    if (!authHeader?.startsWith('Bearer test-token')) {
      return new Response(JSON.stringify({ error: { code: 'InvalidAuthenticationToken' } }), { status: 401 });
    }

    // Strip the GRAPH_BASE prefix to get the relative path
    const basePath = '/me/drive/special/approot';
    if (!path.startsWith(basePath)) {
      return new Response(JSON.stringify({ error: { code: 'itemNotFound' } }), { status: 404 });
    }
    const relative = path.slice(basePath.length);

    // GET /children — list files
    if (relative === '/children' && method === 'GET') {
      const value: OneDriveItemRaw[] = Array.from(files.values()).map(f => ({
        id: f.id,
        name: f.name,
        lastModifiedDateTime: f.lastModifiedDateTime,
        eTag: f.eTag,
        cTag: f.cTag,
        size: f.size,
      }));
      return new Response(JSON.stringify({ value }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse path for file operations: /:/{fileName}:/content or /:/{fileName}
    const contentMatch = relative.match(/^:\/([^:]+):\/content$/);
    const itemMatch = relative.match(/^:\/([^:]+)$/);

    // PUT :/{fileName}:/content — create or update file content
    if (contentMatch && method === 'PUT') {
      const fileName = contentMatch[1];
      const body = init?.body as string;
      const ifMatch = (init?.headers as Record<string, string>)?.['If-Match'];

      // Check existing file for If-Match
      const existing = Array.from(files.values()).find(f => f.name === fileName);

      if (ifMatch !== undefined) {
        if (!existing || existing.eTag !== ifMatch) {
          return new Response(JSON.stringify({ error: { code: 'resourceModified' } }), { status: 412 });
        }
      }

      if (existing) {
        // Update existing file
        existing.content = body;
        existing.eTag = generateETag();
        existing.cTag = generateETag();
        existing.lastModifiedDateTime = new Date().toISOString();
        existing.size = body.length;

        return new Response(JSON.stringify({
          id: existing.id,
          name: existing.name,
          lastModifiedDateTime: existing.lastModifiedDateTime,
          eTag: existing.eTag,
          cTag: existing.cTag,
          size: existing.size,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Create new file
      const id = generateId();
      const eTag = generateETag();
      const cTag = generateETag();
      const now = new Date().toISOString();
      const file: MockFile = {
        id,
        name: fileName,
        content: body,
        eTag,
        cTag,
        lastModifiedDateTime: now,
        size: body.length,
      };
      files.set(id, file);

      return new Response(JSON.stringify({
        id: file.id,
        name: file.name,
        lastModifiedDateTime: file.lastModifiedDateTime,
        eTag: file.eTag,
        cTag: file.cTag,
        size: file.size,
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    // GET :/{fileName}:/content — download file content
    if (contentMatch && method === 'GET') {
      const fileName = contentMatch[1];
      const file = Array.from(files.values()).find(f => f.name === fileName);
      if (!file) {
        return new Response(JSON.stringify({ error: { code: 'itemNotFound' } }), { status: 404 });
      }
      return new Response(file.content, { status: 200 });
    }

    // GET :/{fileName} — item metadata
    if (itemMatch && method === 'GET') {
      const fileName = itemMatch[1];
      const file = Array.from(files.values()).find(f => f.name === fileName);
      if (!file) {
        return new Response(JSON.stringify({ error: { code: 'itemNotFound' } }), { status: 404 });
      }
      return new Response(JSON.stringify({
        id: file.id,
        name: file.name,
        lastModifiedDateTime: file.lastModifiedDateTime,
        eTag: file.eTag,
        cTag: file.cTag,
        size: file.size,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // DELETE :/{fileName}
    if (itemMatch && method === 'DELETE') {
      const fileName = itemMatch[1];
      const file = Array.from(files.values()).find(f => f.name === fileName);
      if (!file) {
        return new Response(JSON.stringify({ error: { code: 'itemNotFound' } }), { status: 404 });
      }
      files.delete(file.id);
      return new Response('', { status: 204 });
    }

    return new Response(JSON.stringify({ error: { code: 'BadRequest' } }), { status: 400 });
  };

  return { mockFetch, reset, files };
}
```

- [ ] **Step 12: Commit**

```bash
git add packages/provider-onedrive/src/__tests__/onedrive-api-mock.ts
git commit -m "test(provider-onedrive): add Microsoft Graph API mock helper"
```

---

### Task 5: Provider — Failing Tests

**Files:**
- Create: `packages/provider-onedrive/src/__tests__/onedrive-provider.test.ts`

- [ ] **Step 13: Write the failing provider tests**

```ts
import { describe, it, expect } from 'vitest';
import { OneDriveProvider } from '../onedrive-provider.js';
import { createOneDriveApiMock } from './onedrive-api-mock.js';
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
  const api = createOneDriveApiMock();
  const auth = createFakeOAuthClient();
  const provider = new OneDriveProvider({ auth, fetchFn: api.mockFetch as typeof fetch });
  return { provider, api, auth };
}

describe('OneDriveProvider', () => {
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
      const provider = new OneDriveProvider({ auth, fetchFn: (() => {}) as typeof fetch });
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
      const provider = new OneDriveProvider({ auth, fetchFn: (() => {}) as typeof fetch });
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
      const provider = new OneDriveProvider({ auth, fetchFn: (() => {}) as typeof fetch });
      expect(await provider.isConnected()).toBe(false);
    });

    it('getProfile returns profile with provider id when connected', async () => {
      const { provider } = createProvider();
      const profile = await provider.getProfile();
      expect(profile).not.toBeNull();
      expect(profile!.provider).toBe('onedrive');
    });

    it('getProfile returns null when no tokens', async () => {
      const auth: OAuthClient = {
        login: async () => {},
        logout: async () => {},
        getAccessToken: async () => { throw new Error('no tokens'); },
        getTokens: async () => null,
        getAuthHeaders: async () => ({ Authorization: 'Bearer token' }),
      };
      const provider = new OneDriveProvider({ auth, fetchFn: (() => {}) as typeof fetch });
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
        provider.writeFile('conflict.json', '{"v":2}', { expectedRevision: 'wrong-etag' }),
      ).rejects.toThrow(ConflictError);
    });

    it('writeFile without expectedRevision always succeeds', async () => {
      const { provider } = createProvider();
      await provider.writeFile('free.json', '{"v":1}');
      const updated = await provider.writeFile('free.json', '{"v":2}');
      expect(updated.revision).toBeDefined();
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
      const { mockFetch } = createOneDriveApiMock();
      const provider = new OneDriveProvider({ auth, fetchFn: mockFetch as typeof fetch });
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

Run: `cd packages/provider-onedrive; npx vitest run src/__tests__/onedrive-provider.test.ts`
Expected: FAIL — module `../onedrive-provider.js` not found

---

### Task 6: Provider — Implementation

**Files:**
- Create: `packages/provider-onedrive/src/onedrive-provider.ts`

- [ ] **Step 15: Write the OneDriveProvider implementation**

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

- [ ] **Step 16: Run provider tests to verify they pass**

Run: `cd packages/provider-onedrive; npx vitest run src/__tests__/onedrive-provider.test.ts`
Expected: ALL PASS

- [ ] **Step 17: Commit**

```bash
git add packages/provider-onedrive/src/onedrive-provider.ts packages/provider-onedrive/src/__tests__/onedrive-provider.test.ts
git commit -m "feat(provider-onedrive): add OneDriveProvider with tests"
```

---

### Task 7: Contract Tests

**Files:**
- Create: `packages/provider-onedrive/src/__tests__/onedrive-contract.test.ts`

- [ ] **Step 18: Write the contract conformance tests**

```ts
import { describeProviderContract } from '@storage-bridge/testing';
import { OneDriveProvider } from '../onedrive-provider.js';
import { createOneDriveApiMock } from './onedrive-api-mock.js';
import type { OAuthClient } from '@storage-bridge/auth-web';

function createContractProvider(): OneDriveProvider {
  const api = createOneDriveApiMock();
  const auth: OAuthClient = {
    login: async () => {},
    logout: async () => {},
    getAccessToken: async () => 'test-token',
    getTokens: async () => ({ accessToken: 'test-token', tokenType: 'Bearer', expiresAt: Date.now() + 3600000 }),
    getAuthHeaders: async () => ({ Authorization: 'Bearer test-token' }),
  };
  return new OneDriveProvider({ auth, fetchFn: api.mockFetch as typeof fetch });
}

describeProviderContract('OneDriveProvider', createContractProvider);
```

- [ ] **Step 19: Run contract tests to verify they pass**

Run: `cd packages/provider-onedrive; npx vitest run src/__tests__/onedrive-contract.test.ts`
Expected: ALL PASS

- [ ] **Step 20: Commit**

```bash
git add packages/provider-onedrive/src/__tests__/onedrive-contract.test.ts
git commit -m "test(provider-onedrive): add provider contract conformance tests"
```

---

### Task 8: Barrel Export and Final Verification

**Files:**
- Create: `packages/provider-onedrive/src/index.ts`

- [ ] **Step 21: Create the barrel export**

```ts
export * from './onedrive-mapper.js';
export * from './onedrive-provider.js';
```

- [ ] **Step 22: Run full test suite**

Run: `cd packages/provider-onedrive; npx vitest run`
Expected: ALL PASS

- [ ] **Step 23: Run typecheck**

Run: `cd packages/provider-onedrive; npx tsc --noEmit`
Expected: No errors

- [ ] **Step 24: Commit**

```bash
git add packages/provider-onedrive/src/index.ts
git commit -m "feat(provider-onedrive): add barrel export"
```

---

## Acceptance Criteria Mapping

| AC | Task |
|----|------|
| #1 Extends FileBackedDocumentProvider | Task 6: `OneDriveProvider extends FileBackedDocumentProvider` |
| #2 Uses /me/drive/special/approot endpoints | Task 6: `GRAPH_BASE = '.../special/approot'`, all methods use path-based addressing |
| #3 Returns null on 404 for read | Task 6: `readFile` checks `res.status === 404` and returns `null` |
| #4 Delegates auth to injected OAuthClient | Task 6: Constructor injection, `auth.getAuthHeaders()` on all calls |
| #5 Passes provider contract tests | Task 7: `describeProviderContract` runs against mock |
| #6 Unit tests with mocked fetch | Tasks 2–6: All tests use `createOneDriveApiMock()`