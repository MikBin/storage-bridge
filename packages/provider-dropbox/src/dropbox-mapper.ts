import type { FileEntry } from '@storage-bridge/core';

/**
 * Shape of a Dropbox file metadata entry from the v2 API.
 * Only the fields we use are declared.
 */
export interface DropboxFileRaw {
  id: string;
  name: string;
  '.tag': string;
  server_modified?: string;
  rev?: string;
  size?: number;
}

/**
 * Convert a raw Dropbox API file metadata entry to a FileEntry.
 * Pure function — no side effects, no dependencies.
 */
export function toFileEntry(
  raw: DropboxFileRaw,
  fileNameToKey: (name: string) => string,
): FileEntry {
  return {
    id: raw.id,
    name: raw.name,
    logicalKey: fileNameToKey(raw.name),
    updatedAt: raw.server_modified,
    revision: raw.rev,
    size: raw.size,
  };
}