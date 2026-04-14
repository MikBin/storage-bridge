import type { DocumentStoreProvider } from '@storage-bridge/core';

/**
 * Factory function that creates a fresh DocumentStoreProvider for each test.
 * Matches the ProviderDescriptor.create() pattern from the registry.
 */
export type ProviderFactory = () => DocumentStoreProvider;
