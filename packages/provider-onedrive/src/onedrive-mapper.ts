import type { FileEntry } from '@storage-bridge/core';

/**
 * Shape of a Microsoft Graph DriveItem resource.
 * Only the fields we use are declared.
 */
export interface OneDriveItemRaw {
  id: string;
  name: string;
  lastModifiedDateTime?: string;
  eTag?: string;
  cTag?: string;
  size?: number;
}

/**
 * Convert a raw Microsoft Graph DriveItem to a FileEntry.
 * Pure function — no side effects, no dependencies.
 */
export function toFileEntry(
  raw: OneDriveItemRaw,
  fileNameToKey: (name: string) => string,
): FileEntry {
  return {
    id: raw.id,
    name: raw.name,
    logicalKey: fileNameToKey(raw.name),
    updatedAt: raw.lastModifiedDateTime,
    revision: raw.eTag ?? raw.cTag,
    size: typeof raw.size === 'number' ? raw.size : undefined,
  };
}
