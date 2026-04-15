import type { FileEntry } from '@storage-bridge/core';

export interface GoogleDriveFileRaw {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  version?: string;
}

export function toFileEntry(
  raw: GoogleDriveFileRaw,
  fileNameToKey: (name: string) => string,
): FileEntry {
  return {
    id: raw.id,
    name: raw.name,
    logicalKey: fileNameToKey(raw.name),
    updatedAt: raw.modifiedTime,
    revision: raw.version ? String(raw.version) : undefined,
    size: raw.size ? Number(raw.size) : undefined,
  };
}
