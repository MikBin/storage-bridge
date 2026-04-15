import { describe, it, expect } from 'vitest';
import { toFileEntry, type GoogleDriveFileRaw } from '../google-drive-mapper.js';

const defaultFileNameToKey = (name: string) => name.replace(/\.json$/, '');

describe('toFileEntry', () => {
  it('maps a full GoogleDriveFileRaw to FileEntry', () => {
    const raw: GoogleDriveFileRaw = {
      id: 'file-123',
      name: 'settings.json',
      mimeType: 'application/json',
      size: '256',
      modifiedTime: '2026-04-14T12:00:00.000Z',
      version: '42',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.id).toBe('file-123');
    expect(entry.name).toBe('settings.json');
    expect(entry.logicalKey).toBe('settings');
    expect(entry.updatedAt).toBe('2026-04-14T12:00:00.000Z');
    expect(entry.revision).toBe('42');
    expect(entry.size).toBe(256);
  });

  it('handles missing optional fields', () => {
    const raw: GoogleDriveFileRaw = {
      id: 'file-456',
      name: 'minimal.json',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.id).toBe('file-456');
    expect(entry.updatedAt).toBeUndefined();
    expect(entry.revision).toBeUndefined();
    expect(entry.size).toBeUndefined();
  });

  it('converts version to string', () => {
    const raw: GoogleDriveFileRaw = {
      id: 'f1',
      name: 'a.json',
      version: '7',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.revision).toBe('7');
    expect(typeof entry.revision).toBe('string');
  });

  it('converts size to number', () => {
    const raw: GoogleDriveFileRaw = {
      id: 'f2',
      name: 'b.json',
      size: '1024',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.size).toBe(1024);
  });

  it('uses the provided fileNameToKey function', () => {
    const raw: GoogleDriveFileRaw = {
      id: 'f3',
      name: 'my%20key.json',
    };
    const decodeFileNameToKey = (name: string) => decodeURIComponent(name.replace(/\.json$/, ''));
    const entry = toFileEntry(raw, decodeFileNameToKey);
    expect(entry.logicalKey).toBe('my key');
  });
});
