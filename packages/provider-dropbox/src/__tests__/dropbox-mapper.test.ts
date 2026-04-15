import { describe, it, expect } from 'vitest';
import { toFileEntry, type DropboxFileRaw } from '../dropbox-mapper.js';

const defaultFileNameToKey = (name: string) => name.replace(/\.json$/, '');

describe('toFileEntry', () => {
  it('maps a full DropboxFileRaw to FileEntry', () => {
    const raw: DropboxFileRaw = {
      id: 'id:abc123',
      name: 'settings.json',
      '.tag': 'file',
      server_modified: '2026-04-15T12:00:00.000Z',
      rev: '0123456789',
      size: 256,
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.id).toBe('id:abc123');
    expect(entry.name).toBe('settings.json');
    expect(entry.logicalKey).toBe('settings');
    expect(entry.updatedAt).toBe('2026-04-15T12:00:00.000Z');
    expect(entry.revision).toBe('0123456789');
    expect(entry.size).toBe(256);
  });

  it('handles missing optional fields', () => {
    const raw: DropboxFileRaw = {
      id: 'id:xyz789',
      name: 'minimal.json',
      '.tag': 'file',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.id).toBe('id:xyz789');
    expect(entry.updatedAt).toBeUndefined();
    expect(entry.revision).toBeUndefined();
    expect(entry.size).toBeUndefined();
  });

  it('preserves rev as string', () => {
    const raw: DropboxFileRaw = {
      id: 'id:rev1',
      name: 'a.json',
      '.tag': 'file',
      rev: 'abcdef',
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.revision).toBe('abcdef');
    expect(typeof entry.revision).toBe('string');
  });

  it('handles numeric size', () => {
    const raw: DropboxFileRaw = {
      id: 'id:size1',
      name: 'b.json',
      '.tag': 'file',
      size: 1024,
    };
    const entry = toFileEntry(raw, defaultFileNameToKey);
    expect(entry.size).toBe(1024);
  });

  it('uses the provided fileNameToKey function', () => {
    const raw: DropboxFileRaw = {
      id: 'id:fn2k',
      name: 'my%20key.json',
      '.tag': 'file',
    };
    const decodeFileNameToKey = (name: string) => decodeURIComponent(name.replace(/\.json$/, ''));
    const entry = toFileEntry(raw, decodeFileNameToKey);
    expect(entry.logicalKey).toBe('my key');
  });
});