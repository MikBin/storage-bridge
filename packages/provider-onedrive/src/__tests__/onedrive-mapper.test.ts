import { describe, it, expect } from 'vitest';
import { toFileEntry, type OneDriveItemRaw } from '../onedrive-mapper.js';

const defaultFileNameToKey = (name: string) => name.replace(/\.json$/, '');

describe('toFileEntry', () => {
  it('maps a full OneDriveItemRaw to FileEntry', () => {
    const raw: OneDriveItemRaw = {
      id: 'item-123',
      name: 'settings.json',
      lastModifiedDateTime: '2026-04-14T12:00:00.000Z',
      eTag: '"{{etag-abc}}"',
      cTag: '"{{ctag-xyz}}"',
      size: 256,
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.id).toBe('item-123');
    expect(entry.name).toBe('settings.json');
    expect(entry.logicalKey).toBe('settings');
    expect(entry.updatedAt).toBe('2026-04-14T12:00:00.000Z');
    expect(entry.revision).toBe('"{{etag-abc}}"');
    expect(entry.size).toBe(256);
  });

  it('handles missing optional fields', () => {
    const raw: OneDriveItemRaw = {
      id: 'item-456',
      name: 'minimal.json',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.id).toBe('item-456');
    expect(entry.updatedAt).toBeUndefined();
    expect(entry.revision).toBeUndefined();
    expect(entry.size).toBeUndefined();
  });

  it('uses eTag as revision, falling back to cTag', () => {
    const withBoth: OneDriveItemRaw = {
      id: 'f1',
      name: 'a.json',
      eTag: '"etag-value"',
      cTag: '"ctag-value"',
    };
    expect(toFileEntry(withBoth, defaultFileNameToKey).revision).toBe('"etag-value"');

    const withOnlyCTag: OneDriveItemRaw = {
      id: 'f2',
      name: 'b.json',
      cTag: '"ctag-only"',
    };
    expect(toFileEntry(withOnlyCTag, defaultFileNameToKey).revision).toBe('"ctag-only"');

    const withNeither: OneDriveItemRaw = {
      id: 'f3',
      name: 'c.json',
    };
    expect(toFileEntry(withNeither, defaultFileNameToKey).revision).toBeUndefined();
  });

  it('handles numeric size', () => {
    const raw: OneDriveItemRaw = {
      id: 'f4',
      name: 'd.json',
      size: 1024,
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.size).toBe(1024);
    expect(typeof entry.size).toBe('number');
  });

  it('uses the provided fileNameToKey function', () => {
    const raw: OneDriveItemRaw = {
      id: 'f5',
      name: 'my%20key.json',
    };
    const decodeFileNameToKey = (name: string) => decodeURIComponent(name.replace(/\.json$/, ''));
    const entry = toFileEntry(raw, decodeFileNameToKey);
    expect(entry.logicalKey).toBe('my key');
  });
});
