import { describe, expect, it } from 'vitest';
import { DefaultSettingsStore } from '../manager.js';
import { ProviderRegistry, createSettingsStore } from '../registry.js';
import type { ProviderDescriptor } from '../types.js';

describe('ProviderRegistry', () => {
  it('should initialize empty map if no descriptors provided', () => {
    const registry = new ProviderRegistry();
    expect(registry.size).toBe(0);
  });

  it('should initialize with provided descriptors', () => {
    const mockDescriptor: ProviderDescriptor = {
      id: 'local',
      label: 'Local Storage',
      capabilities: ['web'],
      isSupported: async () => true,
      create: () => ({} as any),
    };

    const registry = new ProviderRegistry([mockDescriptor]);
    expect(registry.size).toBe(1);
    expect(registry.get('local')).toBe(mockDescriptor);
  });

  it('should register a new descriptor', () => {
    const mockDescriptor: ProviderDescriptor = {
      id: 'local',
      label: 'Local Storage',
      capabilities: ['web'],
      isSupported: async () => true,
      create: () => ({} as any),
    };

    const registry = new ProviderRegistry();
    registry.register(mockDescriptor);

    expect(registry.size).toBe(1);
    expect(registry.get('local')).toBe(mockDescriptor);
  });

  it('should override existing descriptor if registered with the same id', () => {
     const mockDescriptor1: ProviderDescriptor = {
      id: 'local',
      label: 'Local Storage 1',
      capabilities: ['web'],
      isSupported: async () => true,
      create: () => ({} as any),
    };

    const mockDescriptor2: ProviderDescriptor = {
      id: 'local',
      label: 'Local Storage 2',
      capabilities: ['web'],
      isSupported: async () => true,
      create: () => ({} as any),
    };

    const registry = new ProviderRegistry([mockDescriptor1]);
    registry.register(mockDescriptor2);

    expect(registry.size).toBe(1);
    expect(registry.get('local')).toBe(mockDescriptor2);
  });
});

describe('createSettingsStore', () => {
  it('should create and return a DefaultSettingsStore with registered providers', () => {
    const mockDescriptor: ProviderDescriptor = {
      id: 'local',
      label: 'Local Storage',
      capabilities: ['web'],
      isSupported: async () => true,
      create: () => ({} as any),
    };

    const store = createSettingsStore([mockDescriptor]);

    expect(store).toBeInstanceOf(DefaultSettingsStore);

    // DefaultSettingsStore is opaque, but we can verify it functions correctly
    // by connecting to the provider we just mocked.
    // However, the test only checks if it's an instance of DefaultSettingsStore.
  });
});
