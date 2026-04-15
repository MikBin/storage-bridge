import { describe, it, expect } from 'vitest';
import { mapToCloudRecord, mapFromCloudRecord } from '../record-mapper.js';

describe('record-mapper', () => {
  describe('mapToCloudRecord', () => {
    it('maps CloudKit record to CloudRecord', () => {
      const ckRecord = {
        recordName: 'doc1',
        recordType: 'SettingsDocument',
        recordChangeTag: 'tag123',
        modified: { timestamp: 1600000000000 },
        fields: {
          key: { value: 'doc1' },
          schemaVersion: { value: 1 },
          data: { value: { foo: 'bar' } }
        }
      };

      const result = mapToCloudRecord(ckRecord);

      expect(result).toEqual({
        recordName: 'doc1',
        changeTag: 'tag123',
        modifiedAt: new Date(1600000000000).toISOString(),
        fields: {
          key: 'doc1',
          schemaVersion: 1,
          data: { foo: 'bar' }
        }
      });
    });

    it('handles missing modified timestamp gracefully', () => {
       const ckRecord = {
        recordName: 'doc2',
        recordType: 'SettingsDocument',
        recordChangeTag: 'tag123',
        fields: {
          key: { value: 'doc2' }
        }
      };

      const result = mapToCloudRecord(ckRecord);

      expect(result).toEqual({
        recordName: 'doc2',
        changeTag: 'tag123',
        modifiedAt: undefined,
        fields: {
          key: 'doc2'
        }
      });
    });
  });

  describe('mapFromCloudRecord', () => {
    it('maps CloudRecord to CloudKit fields format', () => {
      const cloudRecord = {
        recordName: 'doc1',
        fields: {
          key: 'doc1',
          schemaVersion: 1,
          data: { foo: 'bar' }
        }
      };

      const result = mapFromCloudRecord(cloudRecord);

      expect(result).toEqual({
        recordName: 'doc1',
        recordType: 'SettingsDocument',
        fields: {
          key: { value: 'doc1' },
          schemaVersion: { value: 1 },
          data: { value: { foo: 'bar' } }
        }
      });
    });

    it('includes changeTag if provided for update operations', () => {
      const cloudRecord = {
        recordName: 'doc1',
        changeTag: 'tag123',
        fields: {
          key: 'doc1'
        }
      };

      const result = mapFromCloudRecord(cloudRecord);

      expect(result).toEqual({
        recordName: 'doc1',
        recordType: 'SettingsDocument',
        recordChangeTag: 'tag123',
        fields: {
          key: { value: 'doc1' }
        }
      });
    });
  });
});
