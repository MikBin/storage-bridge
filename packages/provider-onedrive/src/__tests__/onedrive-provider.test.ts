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
      const provider = new OneDriveProvider({ auth, fetchFn: (() => {}) as unknown as typeof fetch });
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
      const provider = new OneDriveProvider({ auth, fetchFn: (() => {}) as unknown as typeof fetch });
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
      const provider = new OneDriveProvider({ auth, fetchFn: (() => {}) as unknown as typeof fetch });
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
      const provider = new OneDriveProvider({ auth, fetchFn: (() => {}) as unknown as typeof fetch });
      expect(await provider.getProfile()).toBeNull();
    });
  });

  describe('CRUD via FileBackedDocumentProvider', () => {
    it('listFiles returns empty when no files exist', async () => {
      const { provider } = createProvider();
      const files = await (provider as any).listFiles();
      expect(files).toEqual([]);
    });

    it('writeFile creates a new file and readFile retrieves it', async () => {
      const { provider } = createProvider();
      const meta = await (provider as any).writeFile('test-key.json', '{"data":true}');
      expect(meta.id).toBeDefined();
      expect(meta.revision).toBeDefined();

      const result = await (provider as any).readFile('test-key.json');
      expect(result).not.toBeNull();
      expect(result!.text).toBe('{"data":true}');
      expect(result!.meta.revision).toBe(meta.revision);
    });

    it('writeFile updates an existing file', async () => {
      const { provider } = createProvider();
      const v1 = await (provider as any).writeFile('cfg.json', '{"v":1}');
      const v2 = await (provider as any).writeFile('cfg.json', '{"v":2}');
      expect(v2.revision).not.toBe(v1.revision);

      const result = await (provider as any).readFile('cfg.json');
      expect(result!.text).toBe('{"v":2}');
    });

    it('removeFile deletes a file', async () => {
      const { provider } = createProvider();
      await (provider as any).writeFile('del.json', '{}');
      await (provider as any).removeFile('del.json');
      const result = await (provider as any).readFile('del.json');
      expect(result).toBeNull();
    });

    it('removeFile is no-op for missing file', async () => {
      const { provider } = createProvider();
      await expect((provider as any).removeFile('nonexistent.json')).resolves.toBeUndefined();
    });

    it('listFiles returns all stored files', async () => {
      const { provider } = createProvider();
      await (provider as any).writeFile('a.json', '{}');
      await (provider as any).writeFile('b.json', '{}');
      const files = await (provider as any).listFiles();
      expect(files).toHaveLength(2);
      const keys = files.map((f: any) => f.name).sort();
      expect(keys).toEqual(['a.json', 'b.json']);
    });
  });

  describe('optimistic concurrency', () => {
    it('writeFile with matching expectedRevision succeeds', async () => {
      const { provider } = createProvider();
      const v1 = await (provider as any).writeFile('conflict.json', '{"v":1}');
      const v2 = await (provider as any).writeFile('conflict.json', '{"v":2}', {
        expectedRevision: v1.revision,
      });
      expect(v2.revision).toBeDefined();
    });

    it('writeFile with mismatched expectedRevision throws ConflictError', async () => {
      const { provider } = createProvider();
      await (provider as any).writeFile('conflict.json', '{"v":1}');
      await expect(
        (provider as any).writeFile('conflict.json', '{"v":2}', { expectedRevision: 'wrong-etag' }),
      ).rejects.toThrow(ConflictError);
    });

    it('writeFile without expectedRevision always succeeds', async () => {
      const { provider } = createProvider();
      await (provider as any).writeFile('free.json', '{"v":1}');
      const updated = await (provider as any).writeFile('free.json', '{"v":2}');
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
      await expect((provider as any).listFiles()).rejects.toThrow(AuthRequiredError);
    });

    it('readFile returns null for 404', async () => {
      const { provider } = createProvider();
      const result = await (provider as any).readFile('nonexistent.json');
      expect(result).toBeNull();
    });
  });
});
