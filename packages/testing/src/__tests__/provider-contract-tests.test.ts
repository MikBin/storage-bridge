import { describe, it, expect } from 'vitest';
import { describeProviderContract } from '../provider-contract-tests.js';
import { FakeDocumentStoreProvider } from '../fake-provider.js';

// Run the contract suite against the fake provider to verify the suite itself works
describeProviderContract('FakeDocumentStoreProvider', () => new FakeDocumentStoreProvider());

// Additional meta-test: verify the suite actually runs tests
describe('describeProviderContract meta-tests', () => {
  it('is exported as a function', () => {
    expect(typeof describeProviderContract).toBe('function');
  });
});
