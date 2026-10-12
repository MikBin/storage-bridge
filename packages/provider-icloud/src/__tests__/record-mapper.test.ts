import { describe, it, expect } from 'vitest';
import { SettingsStoreError, type CloudRecord } from '@storage-bridge/core';
import { mapFromCloudRecord, mapToCloudRecord } from '../record-mapper.js';
import type { CloudKitRecordRaw } from '../cloudkit-client.js';

function envelopeFor(data: unknown): CloudRecord {
  return {
    recordName: 'doc1',
    changeTag: 'tag-1',
    fields: { key: 'doc1', schemaVersion: 1, updatedAt: '2026-04-15T00:00:00.000Z', data },
  };
}

describe('record-mapper', () => {
  describe('mapFromCloudRecord — envelope → single string record field (D3 criterion 4)', () => {
    it('serializes the document payload as JSON into one string field named payload', () => {
      const data = { nested: { list: [1, 2] } };
      const raw = mapFromCloudRecord(envelopeFor(data));

      const payload = raw.fields.payload;
      expect(typeof payload.value).toBe('string');
      expect(JSON.parse(payload.value as string)).toEqual(data);
    });

    it('keeps key, schemaVersion and updatedAt as scalar record fields', () => {
      const raw = mapFromCloudRecord(envelopeFor({ a: 1 }));
      expect(raw.fields.key).toEqual({ value: 'doc1' });
      expect(raw.fields.schemaVersion).toEqual({ value: 1 });
      expect(raw.fields.updatedAt).toEqual({ value: '2026-04-15T00:00:00.000Z' });
    });

    it('threads the changeTag as recordChangeTag only when present', () => {
      const withTag = mapFromCloudRecord(envelopeFor({}));
      expect(withTag.recordChangeTag).toBe('tag-1');

      const noTag = mapFromCloudRecord({ ...envelopeFor({}), changeTag: undefined });
      expect(noTag.recordChangeTag).toBeUndefined();
    });

    it('recordType is configurable; default is SettingsDocument (spec :75-77)', () => {
      expect(mapFromCloudRecord(envelopeFor({})).recordType).toBe('SettingsDocument');
      expect(mapFromCloudRecord(envelopeFor({}), 'CustomDoc').recordType).toBe('CustomDoc');
    });
  });

  describe('mapToCloudRecord — single string field → envelope', () => {
    it('rebuilds the document payload from the JSON string field', () => {
      const data = { theme: 'dark', flags: [true, false], emoji: '🚀' };
      const cloud = mapToCloudRecord(mapFromCloudRecord(envelopeFor(data)));
      expect(cloud.fields.data).toEqual(data);
      expect(cloud.fields.key).toBe('doc1');
      expect(cloud.fields.schemaVersion).toBe(1);
      expect(cloud.fields.updatedAt).toBe('2026-04-15T00:00:00.000Z');
    });

    it('maps recordName, changeTag and modified timestamp', () => {
      const raw: CloudKitRecordRaw = {
        recordName: 'doc2',
        recordType: 'SettingsDocument',
        recordChangeTag: 'tag-2',
        modified: { timestamp: 1600000000000 },
        fields: { payload: { value: '{}' } },
      };
      const cloud = mapToCloudRecord(raw);
      expect(cloud.recordName).toBe('doc2');
      expect(cloud.changeTag).toBe('tag-2');
      expect(cloud.modifiedAt).toBe(new Date(1600000000000).toISOString());
    });

    it('treats a record without a payload string field as a coded store error (no silent data loss)', () => {
      const raw: CloudKitRecordRaw = {
        recordName: 'doc3',
        recordType: 'SettingsDocument',
        fields: { key: { value: 'doc3' } },
      };
      expect(() => mapToCloudRecord(raw)).toThrow(SettingsStoreError);
    });
  });

  describe('envelope round-trip losslessness', () => {
    // bypass: fast-check not installed; deterministic case matrix (nested
    // objects, arrays, unicode, emoji, 1MB-ish string, empty object).
    const PAYLOAD_MATRIX: ReadonlyArray<{ label: string; data: unknown }> = [
      { label: 'nested objects', data: { a: { b: { c: { d: 4 } } } } },
      { label: 'arrays', data: { list: [1, 'two', { three: 3 }, [4, 5]] } },
      { label: 'unicode', data: { text: 'réglages-中文-настройки' } },
      { label: 'emoji', data: { text: 'settings 🚀 🍎 ✓' } },
      { label: '1MB-ish string', data: { blob: 'x'.repeat(1_048_576) } },
      { label: 'empty object', data: {} },
      { label: 'empty array', data: { empty: [] } },
      { label: 'scalars mix', data: { n: 42, f: 1.5, t: true, nil: null, s: 'str' } },
    ];

    for (const { label, data } of PAYLOAD_MATRIX) {
      it(`round-trips ${label} losslessly through the string field`, () => {
        const raw = mapFromCloudRecord(envelopeFor(data));
        // Simulate transport serialization: REST and CloudKit JS both JSON-encode records.
        const stored: CloudKitRecordRaw = JSON.parse(JSON.stringify(raw)) as CloudKitRecordRaw;
        const cloud = mapToCloudRecord(stored);
        expect(cloud.fields.data).toEqual(data);
      });
    }
  });
});
