import { describeProviderContract, type ContractFamily } from '@storage-bridge/testing';
import { GoogleDriveProvider } from '../google-drive-provider.js';
import { createDriveApiMock } from './google-drive-api-mock.js';
import type { OAuthClient, OAuthTokens } from '@storage-bridge/core';

/**
 * Honest harness: the unmodified GoogleDriveProvider runs the shared suite
 * against the Drive API mock with a token-stateful auth double. The previous
 * logged-out auth fiction (constant Authorization header regardless of login
 * state) is removed — when logged out the double yields empty headers, so the
 * provider observes a real 401. Pending families declare the post-remediation
 * behavior the provider does not satisfy yet; activating a family is the
 * acceptance gate of the step that owns it.
 */
/**
 * Family participation: all families the harness can exercise run ACTIVE.
 * 'disconnected-operations' was activated by 02-06 (minimal connected flag +
 * uniform pre-connect NotConnectedError guard); 'error-taxonomy' by 02-01.
 * Remaining pending families declare the post-remediation behavior the
 * provider does not satisfy yet; activating a family is the acceptance gate
 * of the step that owns it.
 */
const PENDING_FAMILIES: readonly ContractFamily[] = [];

/**
 * Scenario-level scaffolds: the provider satisfies the rest of the family.
 * 'special-char-keys:apostrophe' (Drive query literal escaping) and the Drive
 * 'error-taxonomy' activation (findFileByName() silent null on HTTP error)
 * were activated by 02-01; the remaining families are owned by the steps
 * annotated above.
 */
const PENDING_SCENARIOS: readonly string[] = [];

const api = createDriveApiMock();

function createHarness(listPageSize?: number): GoogleDriveProvider {
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

  return new GoogleDriveProvider({ auth, fetchFn: api.mockFetch as typeof fetch });
}

function createContractProvider(): GoogleDriveProvider {
  return createHarness();
}

describeProviderContract('GoogleDriveProvider', createContractProvider, {
  pendingFamilies: PENDING_FAMILIES,
  pendingScenarios: PENDING_SCENARIOS,
  withListPageSize: (pageSize) => () => createHarness(pageSize),
  runWithServerError: async (operation) => {
    api.setGlobalFailure(500);
    try {
      await operation();
    } finally {
      api.setGlobalFailure(null);
    }
  },
});
