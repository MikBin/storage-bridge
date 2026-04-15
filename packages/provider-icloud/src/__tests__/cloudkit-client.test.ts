import { describe, it, expect, beforeEach } from 'vitest';
import { CloudKitClient } from '../cloudkit-client.js';
import { createCloudKitApiMock } from './icloud-api-mock.js';

describe('CloudKitClient', () => {
  let apiMock: ReturnType<typeof createCloudKitApiMock>;
  let client: CloudKitClient;

  beforeEach(() => {
    apiMock = createCloudKitApiMock();
    client = new CloudKitClient({
      apiToken: 'test-token',
      containerId: 'iCloud.com.test.container',
      environment: 'development',
      fetchFn: apiMock.fetchFn
    });
  });

  describe('getRecord', () => {
    it('returns null for missing record', async () => {
      const result = await client.getRecord('nonexistent');
      expect(result).toBeNull();
    });

    it('returns record if found', async () => {
      apiMock.reset({
        counter: 0, records: {
          'doc1': {
            recordName: 'doc1',
            recordChangeTag: 'tag1',
            fields: { key: { value: 'doc1' } }
          }
        }
      });

      const result = await client.getRecord('doc1');
      expect(result).toEqual({
        recordName: 'doc1',
        recordType: 'SettingsDocument',
        recordChangeTag: 'tag1',
        modified: expect.any(Object),
        deleted: false,
        fields: { key: { value: 'doc1' } }
      });
    });
  });

  describe('saveRecord', () => {
    it('creates a new record', async () => {
      const result = await client.saveRecord({
        recordName: 'doc1',
        recordType: 'SettingsDocument',
        fields: { key: { value: 'doc1' } }
      });

      expect(result.recordName).toBe('doc1');
      expect(result.recordChangeTag).toBeDefined();

      const state = apiMock.getState();
      expect(state.records['doc1']).toBeDefined();
    });

    it('updates an existing record if expectedRevision matches', async () => {
      apiMock.reset({
        counter: 0, records: {
          'doc1': {
            recordName: 'doc1',
            recordChangeTag: 'tag1',
            fields: { key: { value: 'doc1' } }
          }
        }
      });

      const result = await client.saveRecord({
        recordName: 'doc1',
        recordType: 'SettingsDocument',
        recordChangeTag: 'tag1',
        fields: { key: { value: 'doc1' }, updated: { value: true } }
      });

      expect(result.recordChangeTag).not.toBe('tag1');
      const state = apiMock.getState();
      expect(state.records['doc1'].fields.updated.value).toBe(true);
    });

    it('throws error on conflict', async () => {
      apiMock.reset({
        counter: 0, records: {
          'doc1': {
            recordName: 'doc1',
            recordChangeTag: 'tag1',
            fields: { key: { value: 'doc1' } }
          }
        }
      });

      await expect(client.saveRecord({
        recordName: 'doc1',
        recordType: 'SettingsDocument',
        recordChangeTag: 'old-tag',
        fields: { key: { value: 'doc1' } }
      })).rejects.toThrow('Conflict');
    });
  });

  describe('removeRecord', () => {
    it('deletes a record', async () => {
      apiMock.reset({
        counter: 0, records: {
          'doc1': {
            recordName: 'doc1',
            recordChangeTag: 'tag1',
            fields: { key: { value: 'doc1' } }
          }
        }
      });

      await client.removeRecord('doc1');
      const state = apiMock.getState();
      expect(state.records['doc1']).toBeUndefined();
    });
  });

  describe('listRecords', () => {
    it('returns all records', async () => {
      apiMock.reset({
        counter: 0, records: {
          'doc1': {
            recordName: 'doc1',
            recordChangeTag: 'tag1',
            fields: { key: { value: 'doc1' } }
          },
          'doc2': {
            recordName: 'doc2',
            recordChangeTag: 'tag2',
            fields: { key: { value: 'doc2' } }
          }
        }
      });

      const results = await client.listRecords();
      expect(results).toHaveLength(2);
      expect(results.map(r => r.recordName).sort()).toEqual(['doc1', 'doc2']);
    });
  });
});
