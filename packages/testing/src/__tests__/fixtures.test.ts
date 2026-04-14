import { describe, it, expect } from 'vitest';
import { createSettingsEnvelope, createSettingsSummary, createConnectedProfile } from '../fixtures.js';

describe('createSettingsEnvelope', () => {
  it('returns an envelope with default values', () => {
    const env = createSettingsEnvelope<{ name: string }>();
    expect(env.key).toBe('test-key');
    expect(env.schemaVersion).toBe(1);
    expect(env.updatedAt).toBeDefined();
    expect(typeof env.updatedAt).toBe('string');
    expect(env.data).toEqual({});
    expect(env.revision).toBeUndefined();
  });

  it('applies partial overrides', () => {
    const env = createSettingsEnvelope({ key: 'custom-key', schemaVersion: 3 });
    expect(env.key).toBe('custom-key');
    expect(env.schemaVersion).toBe(3);
    expect(env.data).toEqual({});
  });

  it('allows data override', () => {
    const env = createSettingsEnvelope({ data: { name: 'Alice' } });
    expect(env.data).toEqual({ name: 'Alice' });
  });

  it('sets updatedAt to a recent ISO string', () => {
    const before = new Date(Date.now() - 1000).toISOString();
    const env = createSettingsEnvelope();
    const after = new Date(Date.now() + 1000).toISOString();
    expect(env.updatedAt >= before).toBe(true);
    expect(env.updatedAt <= after).toBe(true);
  });
});

describe('createSettingsSummary', () => {
  it('returns a summary with default values', () => {
    const sum = createSettingsSummary();
    expect(sum.key).toBe('test-key');
    expect(sum.updatedAt).toBeDefined();
    expect(sum.revision).toBeUndefined();
  });

  it('applies partial overrides', () => {
    const sum = createSettingsSummary({ key: 'other', revision: 'rev-1' });
    expect(sum.key).toBe('other');
    expect(sum.revision).toBe('rev-1');
  });
});

describe('createConnectedProfile', () => {
  it('returns a profile with default values', () => {
    const prof = createConnectedProfile();
    expect(prof.provider).toBe('local');
    expect(prof.accountId).toBeUndefined();
    expect(prof.email).toBeUndefined();
    expect(prof.displayName).toBeUndefined();
  });

  it('applies partial overrides', () => {
    const prof = createConnectedProfile({
      provider: 'google-drive',
      email: 'user@example.com',
    });
    expect(prof.provider).toBe('google-drive');
    expect(prof.email).toBe('user@example.com');
  });
});
