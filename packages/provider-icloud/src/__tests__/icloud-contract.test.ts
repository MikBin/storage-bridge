import { describeProviderContract, type ContractFamily } from '@storage-bridge/testing';
import { ICloudProvider } from '../icloud-provider.js';
import { createCloudKitApiMock } from './icloud-api-mock.js';

const apiMock = createCloudKitApiMock();

function createHarness(listPageSize?: number): ICloudProvider {
  apiMock.reset();
  apiMock.setListPageSize(listPageSize ?? null);

  return new ICloudProvider({
    apiToken: 'test-token',
    containerId: 'iCloud.com.test.container',
    environment: 'development',
    fetchFn: apiMock.fetchFn,
  });
}

/**
 * Honest harness: the unmodified ICloudProvider runs the shared suite against
 * the CloudKit API mock. Lifecycle methods are no longer monkey-patched. All
 * pending families and scenarios have been activated by their owning
 * remediation steps — the suite runs fully green with zero expected-fail.
 */
const PENDING_FAMILIES: readonly ContractFamily[] = [];

const PENDING_SCENARIOS: readonly string[] = [];

describeProviderContract('ICloudProvider', () => createHarness(), {
  pendingFamilies: PENDING_FAMILIES,
  pendingScenarios: PENDING_SCENARIOS,
  withListPageSize: pageSize => () => createHarness(pageSize),
  runWithServerError: async operation => {
    apiMock.setGlobalFailure(500);
    try {
      await operation();
    } finally {
      apiMock.setGlobalFailure(null);
    }
  },
});
