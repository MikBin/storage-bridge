import type { CloudRecord } from '@storage-bridge/core';

export interface CloudKitField {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}

export interface CloudKitRecord {
  recordName: string;
  recordType: string;
  recordChangeTag?: string;
  modified?: {
    timestamp: number;
  };
  fields: Record<string, CloudKitField>;
}

export function mapToCloudRecord(ckRecord: CloudKitRecord): CloudRecord {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields: Record<string, any> = {};
  for (const [key, field] of Object.entries(ckRecord.fields)) {
    fields[key] = field.value;
  }

  return {
    recordName: ckRecord.recordName,
    changeTag: ckRecord.recordChangeTag,
    modifiedAt: ckRecord.modified ? new Date(ckRecord.modified.timestamp).toISOString() : undefined,
    fields
  };
}

export function mapFromCloudRecord(record: CloudRecord): CloudKitRecord {
  const fields: Record<string, CloudKitField> = {};
  for (const [key, value] of Object.entries(record.fields)) {
    fields[key] = { value };
  }

  const ckRecord: CloudKitRecord = {
    recordName: record.recordName,
    recordType: 'SettingsDocument',
    fields
  };

  if (record.changeTag) {
    ckRecord.recordChangeTag = record.changeTag;
  }

  return ckRecord;
}
