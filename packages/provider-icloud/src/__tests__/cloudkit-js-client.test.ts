import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRequiredError, ConflictError, SettingsStoreError } from '@storage-bridge/core';
import { CloudKitJsClient } from '../cloudkit-js-client.js';
import type { CloudKitRecordRaw } from '../cloudkit-client.js';

/**
 * Fake of the browser-global CloudKit JS API (window.CloudKit — a script-tag
 * global, never an npm dependency). The adapter must access it defensively and
 * these tests pin the call shapes: configure(token/container/environment),
 * setUpAuth (Apple web sign-in) and the private-database record operations.
 */
function createCloudKitGlobalFake() {
  const configure = vi.fn();
  const setUpAuth = vi.fn(async () => ({ user: { recordName: '_id-1' } }));
  const db = {
    fetchRecordWithName: vi.fn(async () => ({
      recordName: 'doc1',
      recordType: 'SettingsDocument',
      fields: { payload: { value: '{}' } },
    })),
    saveRecords: vi.fn(async (records: unknown[]) => ({ records: [records[0]] })),
    deleteRecordWithName: vi.fn(async (recordName: string) => ({ recordName, deleted: true })),
    performQuery: vi.fn(
      async (
        _query: unknown,
        _options?: unknown,
      ): Promise<{ records?: unknown[]; continuationMarker?: string }> => ({
        records: [],
      }),
    ),
  };
  const container = {
    containerIdentifier: 'iCloud.com.test.container',
    setUpAuth,
    privateCloudDatabase: db,
  };
  const CloudKit = { configure, getDefaultContainer: vi.fn(() => container) };
  return { CloudKit, configure, setUpAuth, container, db };
}

function rawError(message: string, extra: Record<string, unknown>): Error {
  return Object.assign(new Error(message), extra);
}

describe('CloudKitJsClient (CloudKit JS adapter, D3)', () => {
  let fake: ReturnType<typeof createCloudKitGlobalFake>;

  function createClient(): CloudKitJsClient {
    return new CloudKitJsClient({
      containerIdentifier: 'iCloud.com.test.container',
      apiToken: 'web-token',
      environment: 'development',
    });
  }

  async function setUpClient(): Promise<CloudKitJsClient> {
    const client = createClient();
    await client.setUp({
      containerIdentifier: 'iCloud.com.test.container',
      environment: 'development',
    });
    return client;
  }

  beforeEach(() => {
    fake = createCloudKitGlobalFake();
    vi.stubGlobal('CloudKit', fake.CloudKit);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('setUp — Apple web sign-in', () => {
    it('configures CloudKit JS with the api token, container identifier and environment', async () => {
      const client = createClient();
      await client.setUp({
        containerIdentifier: 'iCloud.com.test.container',
        environment: 'development',
      });

      expect(fake.configure).toHaveBeenCalledTimes(1);
      expect(fake.configure.mock.calls[0][0]).toEqual({
        containers: [{ containerIdentifier: 'iCloud.com.test.container', apiToken: 'web-token' }],
        environment: 'development',
      });
    });

    it('performs the web sign-in via container.setUpAuth() and reports authenticated', async () => {
      const client = await setUpClient();
      expect(fake.setUpAuth).toHaveBeenCalledTimes(1);
      expect(client.isAuthenticated()).toBe(true);
    });

    it('maps an auth failure during sign-in to AuthRequiredError', async () => {
      fake.setUpAuth.mockRejectedValue(rawError('auth failed', { httpStatus: 401 }));
      const client = createClient();
      await expect(
        client.setUp({ containerIdentifier: 'iCloud.com.test.container' }),
      ).rejects.toThrow(AuthRequiredError);
    });

    it('rejects with an actionable error when the CloudKit JS global is absent', async () => {
      vi.stubGlobal('CloudKit', undefined);
      const client = createClient();
      const error = await client.setUp({ containerIdentifier: 'iCloud.com.test.container' }).then(
        () => {
          throw new Error('Expected setUp to reject');
        },
        (err: unknown) => err,
      );
      expect(error).toBeInstanceOf(SettingsStoreError);
      expect((error as SettingsStoreError).message).toContain('cloudkit.js');
    });

    it('rejects with an actionable error when no api token is configured', async () => {
      const client = new CloudKitJsClient({ containerIdentifier: 'iCloud.com.test.container' });
      const error = await client.setUp({ containerIdentifier: 'iCloud.com.test.container' }).then(
        () => {
          throw new Error('Expected setUp to reject');
        },
        (err: unknown) => err,
      );
      expect(error).toBeInstanceOf(SettingsStoreError);
      expect(fake.configure).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('tearDown() ends the session so isAuthenticated() turns false', async () => {
      const client = await setUpClient();
      expect(client.isAuthenticated()).toBe(true);
      await client.tearDown();
      expect(client.isAuthenticated()).toBe(false);
    });
  });

  describe('fetchRecord', () => {
    it('asks the private database for the record by name and returns the raw record', async () => {
      const client = await setUpClient();
      const record = await client.fetchRecord('doc1', 'SettingsDocument');
      expect(fake.db.fetchRecordWithName).toHaveBeenCalledWith('doc1');
      expect(record).not.toBeNull();
      expect(record!.recordName).toBe('doc1');
    });

    it('returns null when the record is missing (NOT_FOUND folds to null)', async () => {
      fake.db.fetchRecordWithName.mockRejectedValue(
        rawError('missing', { serverErrorCode: 'NOT_FOUND' }),
      );
      const client = await setUpClient();
      await expect(client.fetchRecord('ghost', 'SettingsDocument')).resolves.toBeNull();
    });

    it('maps 401/403/AUTHENTICATION_REQUIRED to AuthRequiredError', async () => {
      // bypass: fast-check not installed; deterministic auth-failure matrix.
      const authFailures = [
        { label: 'HTTP 401', httpStatus: 401, serverErrorCode: undefined },
        { label: 'HTTP 403', httpStatus: 403, serverErrorCode: undefined },
        {
          label: 'in-band AUTHENTICATION_REQUIRED',
          httpStatus: undefined,
          serverErrorCode: 'AUTHENTICATION_REQUIRED',
        },
        {
          label: 'in-band AUTHENTICATE_REQUIRED',
          httpStatus: undefined,
          serverErrorCode: 'AUTHENTICATE_REQUIRED',
        },
      ];
      const client = await setUpClient();
      for (const failure of authFailures) {
        fake.db.fetchRecordWithName.mockRejectedValue(rawError('auth', failure));
        await expect(client.fetchRecord('doc1', 'SettingsDocument'), failure.label).rejects.toThrow(
          AuthRequiredError,
        );
      }
    });

    it('wraps other failures in coded ICLOUD_RECORD_ERROR with a cause', async () => {
      const raw = rawError('boom', { serverErrorCode: 'UNKNOWN_ERROR', httpStatus: 500 });
      fake.db.fetchRecordWithName.mockRejectedValue(raw);
      const client = await setUpClient();
      const error = await client.fetchRecord('doc1', 'SettingsDocument').then(
        () => {
          throw new Error('Expected fetchRecord to reject');
        },
        (err: unknown) => err,
      );
      expect(error).toBeInstanceOf(SettingsStoreError);
      expect((error as SettingsStoreError).code).toBe('ICLOUD_RECORD_ERROR');
      expect((error as SettingsStoreError).cause).toBe(raw);
    });

    it('rejects with a coded error when used before setUp', async () => {
      const client = createClient();
      await expect(client.fetchRecord('doc1', 'SettingsDocument')).rejects.toThrow(
        SettingsStoreError,
      );
    });
  });

  describe('saveRecord', () => {
    const record: CloudKitRecordRaw = {
      recordName: 'doc1',
      recordType: 'SettingsDocument',
      recordChangeTag: 'tag-1',
      fields: { payload: { value: '{"a":1}' } },
    };

    it('sends the raw record to the private database and returns the saved result', async () => {
      const client = await setUpClient();
      const saved = await client.saveRecord(record);
      expect(fake.db.saveRecords).toHaveBeenCalledWith([record]);
      expect(saved.recordName).toBe('doc1');
      expect(saved.recordChangeTag).toBe('tag-1');
    });

    it('maps an in-band CONFLICT to ConflictError carrying the logical record name', async () => {
      fake.db.saveRecords.mockResolvedValue({
        records: [{ recordName: 'doc1', serverErrorCode: 'CONFLICT', reason: 'Conflict' }],
      });
      const client = await setUpClient();
      const error = await client.saveRecord(record).then(
        () => {
          throw new Error('Expected saveRecord to reject');
        },
        (err: unknown) => err,
      );
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).key).toBe('doc1');
    });

    it('wraps other failures in coded ICLOUD_SAVE_ERROR with a cause', async () => {
      const raw = rawError('boom', { httpStatus: 500 });
      fake.db.saveRecords.mockRejectedValue(raw);
      const client = await setUpClient();
      const error = await client.saveRecord(record).then(
        () => {
          throw new Error('Expected saveRecord to reject');
        },
        (err: unknown) => err,
      );
      expect((error as SettingsStoreError).code).toBe('ICLOUD_SAVE_ERROR');
      expect((error as SettingsStoreError).cause).toBe(raw);
    });
  });

  describe('deleteRecord', () => {
    it('removes the record via the private database', async () => {
      const client = await setUpClient();
      await client.deleteRecord('doc1', 'SettingsDocument');
      expect(fake.db.deleteRecordWithName).toHaveBeenCalledWith('doc1');
    });

    it('is idempotent when the record is missing (NOT_FOUND)', async () => {
      fake.db.deleteRecordWithName.mockRejectedValue(
        rawError('missing', { serverErrorCode: 'NOT_FOUND' }),
      );
      const client = await setUpClient();
      await expect(client.deleteRecord('ghost', 'SettingsDocument')).resolves.toBeUndefined();
    });

    it('wraps other failures in coded ICLOUD_DELETE_ERROR with a cause', async () => {
      const raw = rawError('boom', { httpStatus: 500 });
      fake.db.deleteRecordWithName.mockRejectedValue(raw);
      const client = await setUpClient();
      const error = await client.deleteRecord('doc1', 'SettingsDocument').then(
        () => {
          throw new Error('Expected deleteRecord to reject');
        },
        (err: unknown) => err,
      );
      expect((error as SettingsStoreError).code).toBe('ICLOUD_DELETE_ERROR');
      expect((error as SettingsStoreError).cause).toBe(raw);
    });
  });

  describe('queryRecords — 02-03 continuation shape preserved', () => {
    it('aggregates every page, following continuationMarker until exhausted', async () => {
      const page1 = {
        recordName: 'r1',
        recordType: 'SettingsDocument',
        fields: { payload: { value: '{}' } },
      };
      const page2 = {
        recordName: 'r2',
        recordType: 'SettingsDocument',
        fields: { payload: { value: '{}' } },
      };
      fake.db.performQuery
        .mockResolvedValueOnce({ records: [page1], continuationMarker: 'continuation-1' })
        .mockResolvedValueOnce({ records: [page2] });

      const client = await setUpClient();
      const records = await client.queryRecords('SettingsDocument');

      expect(records.map((r) => r.recordName)).toEqual(['r1', 'r2']);
      expect(fake.db.performQuery).toHaveBeenCalledTimes(2);
      expect(fake.db.performQuery.mock.calls[0][0]).toEqual({ recordType: 'SettingsDocument' });
      expect(fake.db.performQuery.mock.calls[1][0]).toEqual({ recordType: 'SettingsDocument' });
      expect(fake.db.performQuery.mock.calls[1][1]).toEqual({
        continuationMarker: 'continuation-1',
      });
    });
  });
});
