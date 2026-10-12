import { describe, it, expect } from 'vitest';
import { DropboxProvider } from '../dropbox-provider.js';
import { createDropboxApiMock } from './dropbox-api-mock.js';
import type { OAuthClient, OAuthTokens } from '@storage-bridge/auth-web';
import { ConflictError, AuthRequiredError, SettingsStoreError } from '@storage-bridge/core';

const noopFetch = (() => Promise.resolve(new Response())) as unknown as typeof fetch;

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
      const provider = new DropboxProvider({ auth, fetchFn: noopFetch });
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
      const provider = new DropboxProvider({ auth, fetchFn: noopFetch });
      await provider.disconnect();
      expect(logoutCalled).toBe(true);
    });

    it('isConnected reflects the connect/disconnect flag (02-06 uniform pre-connect policy)', async () => {
      const { provider } = createProvider();
      expect(await provider.isConnected()).toBe(false);
      await provider.connect();
      expect(await provider.isConnected()).toBe(true);
      await provider.disconnect();
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
      const provider = new DropboxProvider({ auth, fetchFn: noopFetch });
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

    it('writeFile sends conditional update mode keyed to the read revision', async () => {
      const { provider, api } = createProvider();
      const v1 = await provider.writeFile('cond.json', '{"v":1}');

      const seen: Array<Record<string, string>> = [];
      const conditionalFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        if (headers['Dropbox-API-Arg']?.includes('/cond.json')) {
          seen.push(headers);
        }
        return api.mockFetch(input as string | URL | Request, init);
      }) as typeof fetch;
      const observed = new DropboxProvider({
        auth: createFakeOAuthClient(),
        fetchFn: conditionalFetch,
      });

      await observed.writeFile('cond.json', '{"v":2}', { expectedRevision: v1.revision });

      expect(seen).toHaveLength(1);
      const arg = JSON.parse(seen[0]['Dropbox-API-Arg']);
      expect(arg.mode).toEqual({ '.tag': 'update', update: v1.revision });
    });

    it('writeFile uses overwrite mode under force', async () => {
      const { provider, api } = createProvider();
      await provider.writeFile('forced.json', '{"v":1}');

      const seen: Array<Record<string, string>> = [];
      const conditionalFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        if (headers['Dropbox-API-Arg']?.includes('/forced.json')) {
          seen.push(headers);
        }
        return api.mockFetch(input as string | URL | Request, init);
      }) as typeof fetch;
      const observed = new DropboxProvider({
        auth: createFakeOAuthClient(),
        fetchFn: conditionalFetch,
      });

      const forced = await observed.writeFile('forced.json', '{"v":2}', {
        expectedRevision: 'stale-revision',
        force: true,
      });

      expect(forced.revision).toBeDefined();
      const arg = JSON.parse(seen[0]['Dropbox-API-Arg']);
      expect(arg.mode).toBe('overwrite');
    });

    it('writeFile uses overwrite mode when no expectation is given', async () => {
      const { provider, api } = createProvider();
      await provider.writeFile('free.json', '{"v":1}');

      const seen: Array<Record<string, string>> = [];
      const conditionalFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        if (headers['Dropbox-API-Arg']?.includes('/free.json')) {
          seen.push(headers);
        }
        return api.mockFetch(input as string | URL | Request, init);
      }) as typeof fetch;
      const observed = new DropboxProvider({
        auth: createFakeOAuthClient(),
        fetchFn: conditionalFetch,
      });

      await observed.writeFile('free.json', '{"v":2}');

      const arg = JSON.parse(seen[0]['Dropbox-API-Arg']);
      expect(arg.mode).toBe('overwrite');
    });
  });

  describe('complete-listing corruption guard (02-03)', () => {
    // bypass: fast-check not installed; deterministic page-boundary case.
    // Universe per test: the remote store (fileCount, entriesByName) captured
    // through the driving port; slots not asserted are pinned by before/after
    // snapshot equality (unchanged()).
    interface StoreSnapshot {
      fileCount: number;
      entriesByName: Map<string, string[]>;
    }

    function snapshotStore(api: ReturnType<typeof createDropboxApiMock>): StoreSnapshot {
      const entriesByName = new Map<string, string[]>();
      for (const file of api.files.values()) {
        if (file.deleted) continue;
        entriesByName.set(file.name, [...(entriesByName.get(file.name) ?? []), file.content]);
      }
      return { fileCount: entriesByName.size, entriesByName };
    }

    it('writes to a key stored beyond the first listing page update in place — no duplicate remote files are created', async () => {
      const { provider, api } = createProvider();
      api.setListPageSize(2);

      for (let i = 0; i < 15; i += 1) {
        await provider.writeFile(`bulk-${String(i).padStart(2, '0')}.json`, `{"i":${i}}`);
      }
      const before = snapshotStore(api);

      // The target revision lives beyond page 1 of the listing; a truncated
      // listing view is exactly what used to feed the duplicate-create path.
      const listing = await provider.listFiles();
      const target = listing.find(f => f.name === 'bulk-14.json');
      expect(target).toBeDefined();

      await provider.writeFile('bulk-14.json', '{"i":"updated"}', { expectedRevision: target!.revision });

      const after = snapshotStore(api);
      expect(after.fileCount).toBe(before.fileCount);
      const contents = after.entriesByName.get('bulk-14.json');
      expect(contents).toHaveLength(1);
      expect(contents![0]).toBe('{"i":"updated"}');
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
      await expect((provider as any).listFiles()).rejects.toThrow(AuthRequiredError);
    });

    it('readFile returns null for missing file', async () => {
      const { provider } = createProvider();
      const result = await provider.readFile('nonexistent.json');
      expect(result).toBeNull();
    });

    describe('corrupt metadata header (02-06)', () => {
      // bypass: fast-check not installed; deterministic corrupt-header corpus.
      // A non-JSON or wrong-shape Dropbox-API-Result header must reject with a
      // coded SettingsStoreError chaining the underlying failure — never a raw
      // SyntaxError escaping the provider boundary.
      const CORRUPT_HEADERS: ReadonlyArray<{ label: string; header: string }> = [
        { label: 'non-JSON text', header: 'not-json{' },
        { label: 'a JSON array', header: '[1,2,3]' },
      ];

      function providerWithResultHeader(header: string): DropboxProvider {
        const corruptFetch = (async () =>
          new Response('{"data":true}', {
            status: 200,
            headers: { 'Dropbox-API-Result': header },
          })) as typeof fetch;
        return new DropboxProvider({ auth: createFakeOAuthClient(), fetchFn: corruptFetch });
      }

      for (const { label, header } of CORRUPT_HEADERS) {
        it(`readFile rejects with coded DROPBOX_META_CORRUPT and a chained cause for ${label}`, async () => {
          const provider = providerWithResultHeader(header);

          let error: unknown;
          try {
            await provider.readFile('k.json');
          } catch (e) {
            error = e;
          }

          expect(error).toBeInstanceOf(SettingsStoreError);
          expect((error as SettingsStoreError).code).toBe('DROPBOX_META_CORRUPT');
          expect(error).not.toBeInstanceOf(SyntaxError);
          expect((error as SettingsStoreError).cause).toBeInstanceOf(Error);
        });
      }
    });
  });
});