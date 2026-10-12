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
 * the CloudKit API mock. Lifecycle methods are no longer monkey-patched — the
 * provider's fabricated connection state is declared honestly as pending
 * families instead. Activating a family (removing it from this list) is the
 * acceptance gate of the remediation step that owns it.
 */
const PENDING_FAMILIES: readonly ContractFamily[] = [
  'honest-lifecycle',        // 02-08: provider fabricates connect/isConnected/getProfile state
  'error-taxonomy',          // 02-06: disconnected reads resolve instead of rejecting
  'disconnected-operations', // 02-04: operations succeed before connect()
];

describeProviderContract('ICloudProvider', () => createHarness(), {
  pendingFamilies: PENDING_FAMILIES,
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
