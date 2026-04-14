import { DefaultSettingsStore } from './manager.js';
import type { ProviderDescriptor, ProviderId, SettingsStore } from './types.js';

/**
 * A registry of available document store providers.
 */
export class ProviderRegistry extends Map<ProviderId, ProviderDescriptor> {
  constructor(descriptors: ProviderDescriptor[] = []) {
    super();
    for (const descriptor of descriptors) {
      this.set(descriptor.id, descriptor);
    }
  }

  /**
   * Register a new provider descriptor.
   */
  public register(descriptor: ProviderDescriptor): void {
    this.set(descriptor.id, descriptor);
  }
}

/**
 * Factory function to create a SettingsStore with a set of registered providers.
 */
export function createSettingsStore(descriptors: ProviderDescriptor[]): SettingsStore {
  const registry = new ProviderRegistry(descriptors);
  return new DefaultSettingsStore(registry);
}
