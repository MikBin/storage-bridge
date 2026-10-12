import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageTokenStore, SessionStorageTokenStore } from '../token-store.js';
import type { OAuthTokens } from '../types.js';

const sampleTokens: OAuthTokens = {
  accessToken: 'access-123',
  refreshToken: 'refresh-456',
  expiresAt: Date.now() + 3600000,
  tokenType: 'Bearer',
};

describe('LocalStorageTokenStore', () => {
  let store: LocalStorageTokenStore;

  beforeEach(() => {
    localStorage.clear();
    store = new LocalStorageTokenStore();
  });

  it('returns null for missing provider', () => {
    expect(store.get('google-drive')).toBeNull();
  });

  it('stores and retrieves tokens by providerId', () => {
    store.set('google-drive', sampleTokens);
    const retrieved = store.get('google-drive');
    expect(retrieved).toEqual(sampleTokens);
  });

  it('removes tokens for specific provider', () => {
    store.set('google-drive', sampleTokens);
    store.remove('google-drive');
    expect(store.get('google-drive')).toBeNull();
  });

  it('namespaced keys do not collide across providers', () => {
    const dropboxTokens: OAuthTokens = { accessToken: 'dropbox-access' };
    store.set('google-drive', sampleTokens);
    store.set('dropbox', dropboxTokens);
    expect(store.get('google-drive')).toEqual(sampleTokens);
    expect(store.get('dropbox')).toEqual(dropboxTokens);
  });
});

describe('SessionStorageTokenStore', () => {
  let store: SessionStorageTokenStore;

  beforeEach(() => {
    sessionStorage.clear();
    store = new SessionStorageTokenStore();
  });

  it('returns null for missing provider', () => {
    expect(store.get('onedrive')).toBeNull();
  });

  it('stores and retrieves tokens by providerId', () => {
    store.set('onedrive', sampleTokens);
    const retrieved = store.get('onedrive');
    expect(retrieved).toEqual(sampleTokens);
  });

  it('removes tokens for specific provider', () => {
    store.set('onedrive', sampleTokens);
    store.remove('onedrive');
    expect(store.get('onedrive')).toBeNull();
  });
});

describe('InMemoryTokenStore (03-01 / D1 default)', () => {
  // bypass: fast-check not installed; deterministic case matrix over the
  // TokenStore port (get/set/remove, provider isolation) plus a state-delta
  // over the storage globals proving the store never touches persistence.
  // Dynamic imports keep this file collectable while the class is absent.
  function importTokenStoreModule(): Promise<typeof import('../token-store.js')> {
    return import('../token-store.js');
  }

  function snapshot(storage: Storage): Record<string, string> {
    const contents: Record<string, string> = {};
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i) as string;
      contents[key] = storage.getItem(key) as string;
    }
    return contents;
  }

  function storageUniverse(): Record<string, string | Record<string, string>> {
    return {
      localStorage: snapshot(localStorage),
      sessionStorage: snapshot(sessionStorage),
      'document.cookie': document.cookie,
    };
  }

  it('is exported from the package barrel alongside the web-storage opt-ins', async () => {
    const { InMemoryTokenStore } = await importTokenStoreModule();
    const barrel = await import('../index.js');

    expect(InMemoryTokenStore).toBeTypeOf('function');
    expect(barrel.InMemoryTokenStore).toBe(InMemoryTokenStore);
    expect(barrel.LocalStorageTokenStore).toBeTypeOf('function');
    expect(barrel.SessionStorageTokenStore).toBeTypeOf('function');
  });

  it('stores, retrieves, and removes tokens per provider without cross-provider collisions', async () => {
    const { InMemoryTokenStore } = await importTokenStoreModule();
    const store = new InMemoryTokenStore();

    expect(store.get('google-drive')).toBeNull();

    store.set('google-drive', sampleTokens);
    const dropboxTokens: OAuthTokens = { accessToken: 'dropbox-access' };
    store.set('dropbox', dropboxTokens);

    expect(store.get('google-drive')).toEqual(sampleTokens);
    expect(store.get('dropbox')).toEqual(dropboxTokens);

    store.remove('google-drive');
    expect(store.get('google-drive')).toBeNull();
    expect(store.get('dropbox')).toEqual(dropboxTokens);
  });

  it('never writes to localStorage, sessionStorage, or cookies across a full lifecycle', async () => {
    const { InMemoryTokenStore } = await importTokenStoreModule();
    localStorage.clear();
    sessionStorage.clear();
    const before = storageUniverse();

    const store = new InMemoryTokenStore();
    store.set('google-drive', sampleTokens);
    expect(store.get('google-drive')).toEqual(sampleTokens);
    store.remove('google-drive');
    expect(store.get('google-drive')).toBeNull();

    expect(storageUniverse()).toEqual(before);
  });
});
