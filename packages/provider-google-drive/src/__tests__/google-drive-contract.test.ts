import { describeProviderContract, type ContractFamily } from '@storage-bridge/testing';
import { GoogleDriveProvider } from '../google-drive-provider.js';
import { createDriveApiMock } from './google-drive-api-mock.js';
import type { OAuthClient, OAuthTokens } from '@storage-bridge/auth-web';

/**
 * Honest harness: the unmodified GoogleDriveProvider runs the shared suite
 * against the Drive API mock with a token-stateful auth double. The previous
 * logged-out auth fiction (constant Authorization header regardless of login
 * state) is removed — when logged out the double yields empty headers, so the
 * provider observes a real 401. Pending families declare the post-remediation
 * behavior the provider does not satisfy yet; activating a family is the
 * acceptance gate of the step that owns it.
 */
const PENDING_FAMILIES: readonly ContractFamily[] = [
  'disconnected-operations', // 02-04: reads before connect() resolve to null instead of rejecting
  'error-taxonomy',          // 02-06: findFileByName() swallows HTTP errors and returns null silently
  'conflict-payload',        // 02-05: ConflictError carries the encoded filename, no logical-key payload
];

/**
 * Scenario-level scaffolds: the provider satisfies the rest of the family.
 * The apostrophe key is silently lost today — encodeURIComponent leaves the
 * apostrophe raw, so findFileByName()'s name='…' query never matches the stored
 * file and getDocument() resolves null (review evidence:
 * google-drive-provider.ts findFileByName). Owned by 02-01.
 */
const PENDING_SCENARIOS: readonly string[] = [
  'special-char-keys:apostrophe',
];

function createContractProvider(): GoogleDriveProvider {
  const api = createDriveApiMock();
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

  return new GoogleDriveProvider({ auth, fetchFn: api.mockFetch as typeof fetch });
}

describeProviderContract('GoogleDriveProvider', createContractProvider, {
  pendingFamilies: PENDING_FAMILIES,
  pendingScenarios: PENDING_SCENARIOS,
});
