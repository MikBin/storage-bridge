import { describeProviderContract } from '@storage-bridge/testing';
import { DropboxProvider } from '../dropbox-provider.js';
import { createDropboxApiMock } from './dropbox-api-mock.js';
import type { OAuthClient, OAuthTokens } from '@storage-bridge/auth-web';

function createContractProvider(): DropboxProvider {
  const api = createDropboxApiMock();
  api.reset();

  let tokens: OAuthTokens | null = null;

  const auth: OAuthClient = {
    login: async () => {
      tokens = { accessToken: 'test-token', tokenType: 'Bearer', expiresAt: Date.now() + 3600000 };
    },
    logout: async () => {
      tokens = null;
    },
    getAccessToken: async () => {
      if (!tokens) throw new Error('Not authenticated');
      return tokens.accessToken;
    },
    getTokens: async () => tokens,
    getAuthHeaders: async () => {
      return { Authorization: 'Bearer test-token' };
    },
  };

  return new DropboxProvider({ auth, fetchFn: api.mockFetch as typeof fetch });
}

describeProviderContract('DropboxProvider', createContractProvider);