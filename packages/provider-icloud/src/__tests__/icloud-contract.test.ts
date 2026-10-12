import { describeProviderContract, type ContractFamily } from '@storage-bridge/testing';
import { ICloudProvider } from '../icloud-provider.js';
import { createCloudKitClientMock } from './icloud-api-mock.js';

const clientMock = createCloudKitClientMock();

function createHarness(listPageSize?: number): ICloudProvider {
  clientMock.reset();
  clientMock.setListPageSize(listPageSize ?? null);

  return new ICloudProvider({
    client: clientMock,
    config: { containerIdentifier: 'iCloud.com.test.container', environment: 'development' },
  });
}

/**
 * Honest harness: the unmodified ICloudProvider consumes the injected
 * CloudKitClient port (D3) against a port-level fake. All pending families
 * and scenarios have been activated by their owning remediation steps — the
 * suite runs fully green with zero expected-fail.
 */
const PENDING_FAMILIES: readonly ContractFamily[] = [];

const PENDING_SCENARIOS: readonly string[] = [];

describeProviderContract('ICloudProvider', () => createHarness(), {
  pendingFamilies: PENDING_FAMILIES,
  pendingScenarios: PENDING_SCENARIOS,
  withListPageSize: (pageSize) => () => createHarness(pageSize),
  runWithServerError: async (operation) => {
    clientMock.setGlobalFailure(500);
    try {
      await operation();
    } finally {
      clientMock.setGlobalFailure(null);
    }
  },
});
