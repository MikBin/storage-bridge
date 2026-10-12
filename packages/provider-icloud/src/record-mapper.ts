import { SettingsStoreError, type CloudRecord } from '@storage-bridge/core';
import {
  DEFAULT_RECORD_TYPE,
  type CloudKitField,
  type CloudKitRecordRaw,
} from './cloudkit-client.js';

/**
 * CloudKit fields are typed — arbitrary JSON objects are not valid field
 * values. The document envelope therefore serializes as JSON into the single
 * STRING record field `payload` (D3 criterion 4) and parses back losslessly.
 */
const PAYLOAD_FIELD = 'payload';

function scalarField(value: unknown): CloudKitField {
  return { value };
}

/** Map a raw CloudKit record to our CloudRecord, rehydrating the JSON payload. */
export function mapToCloudRecord(raw: CloudKitRecordRaw): CloudRecord {
  const payloadField = raw.fields?.[PAYLOAD_FIELD];
  if (
    payloadField === undefined ||
    payloadField === null ||
    typeof payloadField.value !== 'string'
  ) {
    throw new SettingsStoreError(
      `CloudKit record ${raw.recordName} is missing its serialized payload string field`,
      'ICLOUD_RECORD_ERROR',
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(payloadField.value);
  } catch (error) {
    throw new SettingsStoreError(
      `CloudKit record ${raw.recordName} carries a corrupt payload`,
      'ICLOUD_RECORD_ERROR',
      error,
    );
  }

  return {
    recordName: raw.recordName,
    changeTag: raw.recordChangeTag,
    modifiedAt: raw.modified ? new Date(raw.modified.timestamp).toISOString() : undefined,
    fields: {
      key: raw.fields.key?.value,
      schemaVersion: raw.fields.schemaVersion?.value,
      updatedAt: raw.fields.updatedAt?.value,
      data,
    },
  };
}

/** Build CloudKit record fields from a CloudRecord for saving, serializing the
 * document payload into the single string field. */
export function mapFromCloudRecord(
  record: CloudRecord,
  recordType: string = DEFAULT_RECORD_TYPE,
): CloudKitRecordRaw {
  const raw: CloudKitRecordRaw = {
    recordName: record.recordName,
    recordType,
    fields: {
      key: scalarField(record.fields.key),
      schemaVersion: scalarField(record.fields.schemaVersion),
      updatedAt: scalarField(record.fields.updatedAt),
      payload: scalarField(JSON.stringify(record.fields.data)),
    },
  };

  if (record.changeTag) {
    raw.recordChangeTag = record.changeTag;
  }

  return raw;
}
