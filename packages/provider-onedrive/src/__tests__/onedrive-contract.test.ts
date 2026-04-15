import { describeProviderContract } from '@storage-bridge/testing';
import { OneDriveProvider } from '../onedrive-provider.js';
import { createOneDriveApiMock } from './onedrive-api-mock.js';
import type { OAuthClient } from '@storage-bridge/auth-web';

function createContractProvider(): OneDriveProvider {
  const api = createOneDriveApiMock();
  let connected = false;
  const auth: OAuthClient = {
    login: async () => { connected = true; },
    logout: async () => { connected = false; },
    getAccessToken: async () => connected ? 'test-token' : null as any,
    getTokens: async () => connected ? ({ accessToken: 'test-token', tokenType: 'Bearer', expiresAt: Date.now() + 3600000 }) : null,
    getAuthHeaders: async () => ({ Authorization: connected ? 'Bearer test-token' : '' }),
  };

  const provider = new OneDriveProvider({ auth, fetchFn: api.mockFetch as typeof fetch });

  // Wrap provider methods to ensure it's connected before operations
  // Except for lifecycle methods
  const wrap = <T extends any[], R>(fn: (...args: T) => Promise<R>) => {
    return async (...args: T): Promise<R> => {
      if (!connected) await provider.connect();
      return fn.apply(provider, args);
    };
  };

  const proxy = new Proxy(provider, {
    get(target, prop) {
      if (['getDocument', 'putDocument', 'listDocuments', 'deleteDocument'].includes(prop as string)) {
        return wrap((target as any)[prop]);
      }
      return (target as any)[prop];
    }
  });

  return proxy as OneDriveProvider;
}

describeProviderContract('OneDriveProvider', createContractProvider);
