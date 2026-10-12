import { describeProviderContract, type ContractFamily } from '@storage-bridge/testing';
import { DropboxProvider } from '../dropbox-provider.js';
import { createDropboxApiMock } from './dropbox-api-mock.js';
import type { OAuthClient, OAuthTokens } from '@storage-bridge/auth-web';

/**
 * Honest harness: the unmodified DropboxProvider runs the shared suite against
 * the Dropbox API mock with a token-stateful auth double. The previous
 * logged-out auth fiction (constant Authorization header regardless of login
 * state) is removed — when logged out the double yields empty headers, so the
 * provider observes a real 401. Pending families declare the post-remediation
 * behavior the provider does not satisfy yet; activating a family is the
 * acceptance gate of the step that owns it.
 */
const PENDING_FAMILIES: readonly ContractFamily[] = [
  'disconnected-operations', // 02-04: provider performs requests without a connection guard
  'conflict-payload',        // 02-05: ConflictError carries the encoded filename, no logical-key payload
];

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
    getAuthHeaders: async (): Promise<Record<string, string>> => {
      if (!tokens) return {};
      return { Authorization: `Bearer ${tokens.accessToken}` };
    },
  };

  return new DropboxProvider({ auth, fetchFn: api.mockFetch as typeof fetch });
}

describeProviderContract('DropboxProvider', createContractProvider, { pendingFamilies: PENDING_FAMILIES });
