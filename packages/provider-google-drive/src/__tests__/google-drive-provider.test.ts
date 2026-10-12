import { describe, it, expect, beforeEach } from 'vitest';
import { GoogleDriveProvider } from '../google-drive-provider.js';
import { createDriveApiMock } from './google-drive-api-mock.js';
import type { OAuthClient, OAuthTokens } from '@storage-bridge/auth-web';
import { ConflictError, AuthRequiredError, SettingsStoreError } from '@storage-bridge/core';

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
        getTokens: async () => ({ accessToken: 'token', tokenType: 'Bearer', expiresAt: Date.now() + 3600000 }),
        getAuthHeaders: async () => ({ Authorization: 'Bearer token' }),
      };
      const provider = new GoogleDriveProvider({ auth, fetchFn: (() => Promise.resolve(new Response())) as unknown as typeof fetch });
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
      const provider = new GoogleDriveProvider({ auth, fetchFn: (() => Promise.resolve(new Response())) as unknown as typeof fetch });
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
      const provider = new GoogleDriveProvider({ auth, fetchFn: (() => Promise.resolve(new Response())) as unknown as typeof fetch });
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
      const provider = new GoogleDriveProvider({ auth, fetchFn: (() => Promise.resolve(new Response())) as unknown as typeof fetch });
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
      const keys = files.map((f: { name: string }) => f.name).sort();
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

  describe('query safety and error honesty (02-01)', () => {
    // bypass: fast-check not installed; deterministic case matrix (explicit key corpus).
    // Universe per test: the remote store (fileCount, filesByName: name -> contents)
    // plus the document returned through the putDocument/getDocument driving port.
    // Slots not asserted are pinned with before/after snapshot equality (unchanged()).
    const KEY_MATRIX = [
      { label: 'an apostrophe', key: "settings-user's-doc" },
      { label: 'a space', key: 'settings doc with spaces' },
      { label: 'a slash', key: 'settings/deep/nested' },
      { label: 'a colon', key: 'settings:section:key' },
      { label: 'unicode characters', key: 'réglages-中文-настройки' },
      { label: 'an emoji', key: 'settings-🚀-doc' },
    ] as const;

    interface StoreSnapshot {
      fileCount: number;
      filesByName: Map<string, string[]>;
    }

    function snapshotStore(api: ReturnType<typeof createDriveApiMock>): StoreSnapshot {
      const filesByName = new Map<string, string[]>();
      for (const file of api.files.values()) {
        filesByName.set(file.name, [...(filesByName.get(file.name) ?? []), file.content]);
      }
      return { fileCount: api.files.size, filesByName };
    }

    for (const { label, key } of KEY_MATRIX) {
      it(`round-trips a key containing ${label} with identical data and no duplicate remote files`, async () => {
        const { provider, api } = createProvider();
        const data = { marker: label };
        const before = snapshotStore(api);

        await provider.putDocument({ key, schemaVersion: 1, updatedAt: '', data });
        await provider.putDocument({ key, schemaVersion: 1, updatedAt: '', data });
        await provider.putDocument({ key, schemaVersion: 1, updatedAt: '', data });

        const after = snapshotStore(api);
        expect(after.fileCount).toBe(before.fileCount + 1);
        expect(after.filesByName.size).toBe(1);
        const contents = [...after.filesByName.values()][0];
        expect(contents).toHaveLength(1);
        const storedDocument = JSON.parse(contents![0]) as { data: { marker: string } };
        expect(storedDocument.data).toEqual(data);

        const retrieved = await provider.getDocument<{ marker: string }>(key);
        expect(retrieved).not.toBeNull();
        expect(retrieved!.key).toBe(key);
        expect(retrieved!.data).toEqual(data);
      });
    }

    it('resolves reads to the exact name match when same-name remote files already exist', async () => {
      const { provider, api } = createProvider();
      const key = "settings-user's-doc";
      const fileName = `${encodeURIComponent(key)}.json`;
      const envelopeFor = (v: number): string =>
        JSON.stringify({ key, schemaVersion: 1, updatedAt: '2026-01-01T00:00:00Z', data: { v } });
      api.files.set('seed-1', {
        id: 'seed-1',
        name: fileName,
        content: envelopeFor(1),
        mimeType: 'application/json',
        modifiedTime: new Date().toISOString(),
        version: 1,
        trashed: false,
      });
      api.files.set('seed-2', {
        id: 'seed-2',
        name: fileName,
        content: envelopeFor(2),
        mimeType: 'application/json',
        modifiedTime: new Date().toISOString(),
        version: 2,
        trashed: false,
      });
      const before = snapshotStore(api);

      const retrieved = await provider.getDocument<{ v: number }>(key);

      const after = snapshotStore(api);
      expect(after).toEqual(before);
      expect(retrieved).not.toBeNull();
      expect([1, 2]).toContain(retrieved!.data.v);
    });

    it('rejects getDocument with a coded SettingsStoreError when the query fails — never silent null', async () => {
      const { provider, api } = createProvider();
      await provider.putDocument({ key: 'taxonomy', schemaVersion: 1, updatedAt: '', data: { v: 1 } });
      const before = snapshotStore(api);

      api.setQueryFailure(500);

      await expect(provider.getDocument('taxonomy')).rejects.toThrow(SettingsStoreError);
      await expect(provider.getDocument('taxonomy')).rejects.toMatchObject({ code: 'DRIVE_QUERY_ERROR' });
      expect(snapshotStore(api)).toEqual(before);
    });

    it('rejects putDocument when the query fails instead of silently creating a duplicate', async () => {
      const { provider, api } = createProvider();
      await provider.putDocument({ key: 'safe-write', schemaVersion: 1, updatedAt: '', data: { v: 1 } });
      const before = snapshotStore(api);

      api.setQueryFailure(500);

      await expect(
        provider.putDocument({ key: 'safe-write', schemaVersion: 1, updatedAt: '', data: { v: 2 } }),
      ).rejects.toMatchObject({ code: 'DRIVE_QUERY_ERROR' });
      expect(snapshotStore(api)).toEqual(before);
    });

    it('preserves AuthRequiredError when the query fails with 401', async () => {
      const api = createDriveApiMock();
      const loggedOutAuth: OAuthClient = {
        login: async () => {},
        logout: async () => {},
        getAccessToken: async () => {
          throw new Error('Not authenticated');
        },
        getTokens: async () => null,
        getAuthHeaders: async () => ({}),
      };
      const provider = new GoogleDriveProvider({ auth: loggedOutAuth, fetchFn: api.mockFetch as typeof fetch });

      await expect(provider.getDocument('any-key')).rejects.toThrow(AuthRequiredError);
    });
  });
});
