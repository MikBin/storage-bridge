import { describe, it, expect, beforeEach } from 'vitest';
import { CloudKitClient } from '../cloudkit-client.js';
import { createCloudKitApiMock } from './icloud-api-mock.js';
import { ConflictError, SettingsStoreError } from '@storage-bridge/core';

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

  describe('coded error taxonomy (02-06)', () => {
    // bypass: fast-check not installed; deterministic per-operation cases.
    // Every CloudKit failure must surface as a coded SettingsStoreError with a
    // populated cause — no raw Error escapes the client boundary.
    async function captureRejection(operation: Promise<unknown>): Promise<unknown> {
      try {
        await operation;
      } catch (error) {
        return error;
      }
      throw new Error('Expected the operation to reject, but it resolved');
    }

    it('getRecord() on a 5xx response rejects with coded ICLOUD_REQUEST_ERROR and a populated cause', async () => {
      apiMock.setGlobalFailure(500);

      const error = await captureRejection(client.getRecord('doc1'));
      expect(error).toBeInstanceOf(SettingsStoreError);
      expect((error as SettingsStoreError).code).toBe('ICLOUD_REQUEST_ERROR');
      expect((error as SettingsStoreError).cause).toBeInstanceOf(Error);
    });

    it('getRecord() with an in-band server error rejects with coded ICLOUD_RECORD_ERROR', async () => {
      apiMock.setOperationFailure('lookup', 'UNKNOWN_ERROR', 'quota exceeded');

      const error = await captureRejection(client.getRecord('doc1'));
      expect(error).toBeInstanceOf(SettingsStoreError);
      expect((error as SettingsStoreError).code).toBe('ICLOUD_RECORD_ERROR');
      expect((error as SettingsStoreError).message).toContain('doc1');
      expect((error as SettingsStoreError).cause).toBeInstanceOf(Error);
    });

    it('saveRecord() on a real server conflict throws ConflictError carrying the record name as key', async () => {
      apiMock.reset({
        counter: 0, records: {
          'doc1': {
            recordName: 'doc1',
            recordChangeTag: 'current-tag',
            fields: { key: { value: 'doc1' } }
          }
        }
      });

      const error = await captureRejection(client.saveRecord({
        recordName: 'doc1',
        recordType: 'SettingsDocument',
        recordChangeTag: 'old-tag',
        fields: { key: { value: 'doc1' } }
      }));

      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).key).toBe('doc1');
    });

    it('saveRecord() with an in-band server error rejects with coded ICLOUD_SAVE_ERROR', async () => {
      apiMock.setOperationFailure('modify', 'UNKNOWN_ERROR', 'validation failed');

      const error = await captureRejection(client.saveRecord({
        recordName: 'doc1',
        recordType: 'SettingsDocument',
        fields: { key: { value: 'doc1' } }
      }));

      expect(error).toBeInstanceOf(SettingsStoreError);
      expect((error as SettingsStoreError).code).toBe('ICLOUD_SAVE_ERROR');
      expect((error as SettingsStoreError).cause).toBeInstanceOf(Error);
    });

    it('removeRecord() with an in-band server error rejects with coded ICLOUD_DELETE_ERROR', async () => {
      apiMock.setOperationFailure('modify', 'UNKNOWN_ERROR', 'delete rejected');

      const error = await captureRejection(client.removeRecord('doc1'));

      expect(error).toBeInstanceOf(SettingsStoreError);
      expect((error as SettingsStoreError).code).toBe('ICLOUD_DELETE_ERROR');
      expect((error as SettingsStoreError).cause).toBeInstanceOf(Error);
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

    it('throws ConflictError on conflict with the record name as payload key', async () => {
      apiMock.reset({
        counter: 0, records: {
          'doc1': {
            recordName: 'doc1',
            recordChangeTag: 'tag1',
            fields: { key: { value: 'doc1' } }
          }
        }
      });

      try {
        await client.saveRecord({
          recordName: 'doc1',
          recordType: 'SettingsDocument',
          recordChangeTag: 'old-tag',
          fields: { key: { value: 'doc1' } }
        });
        throw new Error('Expected saveRecord to reject with ConflictError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).key).toBe('doc1');
      }
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
