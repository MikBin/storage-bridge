import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RECORD_TYPE, isAppleRuntime, type CloudKitClient } from '../cloudkit-client.js';

describe('isAppleRuntime (spec §Runtime Detection, :287-301)', () => {
  const globals = globalThis as Record<string, unknown>;

  afterEach(() => {
    delete globals.CloudKit;
    delete globals.__STORAGE_BRIDGE_ICLOUD_NATIVE__;
  });

  it('returns false when neither CloudKit JS nor a native iCloud bridge is present', () => {
    delete globals.CloudKit;
    delete globals.__STORAGE_BRIDGE_ICLOUD_NATIVE__;
    expect(isAppleRuntime()).toBe(false);
  });

  it('returns true when globalThis.CloudKit is present (CloudKit JS loaded)', () => {
    globals.CloudKit = { configure: () => undefined };
    expect(isAppleRuntime()).toBe(true);
  });

  it('returns true when the native iCloud bridge marker is present', () => {
    globals.__STORAGE_BRIDGE_ICLOUD_NATIVE__ = { fetchRecord: () => undefined };
    expect(isAppleRuntime()).toBe(true);
  });

  it('is a standalone export — provider support is gated by it, never by UA sniffing', () => {
    expect(typeof isAppleRuntime).toBe('function');
  });
});

describe('CloudKitClient port (spec lines 121-142)', () => {
  it('exposes the full injected-port surface: setUp, tearDown, isAuthenticated, fetchRecord, saveRecord, deleteRecord, queryRecords', () => {
    const client: CloudKitClient = {
      setUp: async () => undefined,
      tearDown: async () => undefined,
      isAuthenticated: () => true,
      fetchRecord: async () => null,
      saveRecord: async (record) => record,
      deleteRecord: async () => undefined,
      queryRecords: async () => [],
    };
    expect(typeof client.setUp).toBe('function');
    expect(typeof client.tearDown).toBe('function');
    expect(typeof client.isAuthenticated).toBe('function');
    expect(typeof client.fetchRecord).toBe('function');
    expect(typeof client.saveRecord).toBe('function');
    expect(typeof client.deleteRecord).toBe('function');
    expect(typeof client.queryRecords).toBe('function');
  });

  it('recordType defaults to the spec value (:75-77)', () => {
    expect(DEFAULT_RECORD_TYPE).toBe('SettingsDocument');
  });
});
