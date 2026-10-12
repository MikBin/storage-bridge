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
/**
 * Family participation: 'error-taxonomy' and 'disconnected-operations' were
 * activated by 02-06 (minimal connected flag, uniform pre-connect
 * NotConnectedError guard via the RecordBacked base, coded CloudKit errors).
 *
 * The 02-06 flag also satisfies the isConnected clauses of 'honest-lifecycle'
 * ('starts disconnected', 'disconnect() transitions back') as a side effect —
 * a passing it.fails scaffold fails the suite, so those two run active at
 * scenario granularity. The remaining honest-lifecycle lie (getProfile()
 * fabricating a profile while disconnected) stays pending for 02-08.
 * Activating it is 02-08's acceptance gate.
 */
const PENDING_FAMILIES: readonly ContractFamily[] = [];

const PENDING_SCENARIOS: readonly string[] = [
  'honest-lifecycle:profile-null-when-disconnected', // 02-08
];

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
