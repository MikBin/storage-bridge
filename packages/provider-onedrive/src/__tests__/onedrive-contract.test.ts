import { describeProviderContract, type ContractFamily } from '@storage-bridge/testing';
import { OneDriveProvider } from '../onedrive-provider.js';
import { createOneDriveApiMock } from './onedrive-api-mock.js';
import type { OAuthClient, OAuthTokens } from '@storage-bridge/auth-web';

/**
 * Honest harness: the unmodified OneDriveProvider runs the shared suite against
 * the Graph API mock with a token-stateful auth double. There is no auto-connect
 * Proxy and no disconnected success fiction — when logged out the auth double
 * yields empty headers, so the provider observes a real 401. Pending families
 * declare the post-remediation behavior the provider does not satisfy yet;
 * activating a family is the acceptance gate of the step that owns it.
 */
const PENDING_FAMILIES: readonly ContractFamily[] = [
  'disconnected-operations', // 02-04: provider performs requests without a connection guard
  'conflict-payload',        // 02-05: ConflictError carries the encoded filename, no logical-key payload
];

const api = createOneDriveApiMock();

function createHarness(listPageSize?: number): OneDriveProvider {
  api.reset();
  api.setListPageSize(listPageSize ?? null);

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

  return new OneDriveProvider({ auth, fetchFn: api.mockFetch as typeof fetch });
}

describeProviderContract('OneDriveProvider', () => createHarness(), {
  pendingFamilies: PENDING_FAMILIES,
  withListPageSize: pageSize => () => createHarness(pageSize),
  runWithServerError: async operation => {
    api.setGlobalFailure(500);
    try {
      await operation();
    } finally {
      api.setGlobalFailure(null);
    }
  },
});
