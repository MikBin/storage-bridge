import type { SettingsEnvelope, SettingsSummary, ConnectedProfile } from '@storage-bridge/core';

/**
 * Create a SettingsEnvelope with sensible defaults and optional overrides.
 * Default: key='test-key', schemaVersion=1, updatedAt=now, data={}, no revision
 */
export function createSettingsEnvelope<T = Record<string, unknown>>(
  overrides: Partial<SettingsEnvelope<T>> = {},
): SettingsEnvelope<T> {
  return {
    key: 'test-key',
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    data: {} as T,
    ...overrides,
  };
}

/**
 * Create a SettingsSummary with sensible defaults and optional overrides.
 * Default: key='test-key', updatedAt=now, no revision
 */
export function createSettingsSummary(
  overrides: Partial<SettingsSummary> = {},
): SettingsSummary {
  return {
    key: 'test-key',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a ConnectedProfile with sensible defaults and optional overrides.
 * Default: provider='local', no accountId/email/displayName
 */
export function createConnectedProfile(
  overrides: Partial<ConnectedProfile> = {},
): ConnectedProfile {
  return {
    provider: 'local',
    ...overrides,
  };
}
