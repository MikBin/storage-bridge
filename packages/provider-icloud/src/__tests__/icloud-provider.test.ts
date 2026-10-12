import { describe, it, expect, beforeEach } from 'vitest';
import { AuthRequiredError, ConflictError, SettingsStoreError } from '@storage-bridge/core';
import { ICloudProvider } from '../icloud-provider.js';
import { createCloudKitClientMock, type CloudKitClientMock, type OperationFailure } from './icloud-api-mock.js';
import type { CloudKitClientConfig } from '../cloudkit-client.js';

const CONFIG: CloudKitClientConfig = {
  containerIdentifier: 'iCloud.com.test.container',
  environment: 'development',
};

async function captureRejection(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the operation to reject, but it resolved');
}

describe('ICloudProvider (injected CloudKitClient port, D3)', () => {
  let mock: CloudKitClientMock;
  let provider: ICloudProvider;

  beforeEach(() => {
    mock = createCloudKitClientMock();
    provider = new ICloudProvider({ client: mock, config: CONFIG });
  });

  describe('lifecycle threading (spec §ICloudProvider)', () => {
    it('connect() delegates to client.setUp(config) and transitions to connected', async () => {
      await provider.connect();
      expect(mock.calls).toContainEqual({ method: 'setUp', args: [CONFIG] });
      expect(await provider.isConnected()).toBe(true);
    });

    it('isConnected() requires BOTH the provider flag and the client session', async () => {
      await provider.connect();
      await mock.tearDown(); // client session lost underneath the provider
      expect(await provider.isConnected()).toBe(false);
      expect(await provider.getProfile()).toBeNull();
    });

    it('disconnect() delegates to client.tearDown() and transitions back', async () => {
      await provider.connect();
      await provider.disconnect();
      expect(mock.calls).toContainEqual({ method: 'tearDown', args: [] });
      expect(await provider.isConnected()).toBe(false);
    });

    it('getProfile() returns null when disconnected and only the provider identity when connected — nothing fabricated', async () => {
      expect(await provider.getProfile()).toBeNull();
      await provider.connect();
      expect(await provider.getProfile()).toEqual({ provider: 'icloud' });
    });

    it('connect() maps an auth failure from client.setUp() to AuthRequiredError and stays disconnected', async () => {
      mock.setAuthRequired();
      await expect(provider.connect()).rejects.toThrow(AuthRequiredError);
      expect(await provider.isConnected()).toBe(false);
    });

    it('connect() wraps generic client.setUp() failures in a coded SettingsStoreError with cause', async () => {
      mock.setGlobalFailure(503);
      const error = await captureRejection(provider.connect());
      expect(error).toBeInstanceOf(SettingsStoreError);
      expect((error as SettingsStoreError).code).toBeTruthy();
      expect((error as SettingsStoreError).cause).toBeInstanceOf(Error);
    });
  });

  describe('document round-trip through the single string payload field (D3 criterion 4)', () => {
    it('stores the envelope payload as a JSON string field and reads it back losslessly', async () => {
      await provider.connect();
      const data = { theme: { dark: true }, tags: ['a', 'b'], note: '🚀 unicode ✓' };
      await provider.putDocument({ key: 'settings', schemaVersion: 2, updatedAt: '', data });

      const stored = mock.getState().records['settings'];
      expect(typeof stored.fields.payload.value).toBe('string');
      expect(JSON.parse(stored.fields.payload.value as string)).toEqual(data);

      const retrieved = await provider.getDocument<typeof data>('settings');
      expect(retrieved!.data).toEqual(data);
      expect(retrieved!.schemaVersion).toBe(2);
      expect(retrieved!.revision).toBeDefined();
    });
  });

  describe('recordType threading (spec :75-77)', () => {
    it('threads a custom recordType into every client operation', async () => {
      const custom = new ICloudProvider({ client: mock, config: CONFIG, recordType: 'CustomDoc' });
      await custom.connect();
      await custom.putDocument({ key: 'k', schemaVersion: 1, updatedAt: '', data: { v: 1 } });
      await custom.getDocument('k');
      await custom.listDocuments();
      await custom.deleteDocument('k');

      const saveCall = mock.calls.find(c => c.method === 'saveRecord');
      expect((saveCall!.args[0] as { recordType: string }).recordType).toBe('CustomDoc');
      expect(mock.calls).toContainEqual({ method: 'fetchRecord', args: ['k', 'CustomDoc'] });
      expect(mock.calls).toContainEqual({ method: 'queryRecords', args: ['CustomDoc'] });
      expect(mock.calls).toContainEqual({ method: 'deleteRecord', args: ['k', 'CustomDoc'] });
    });

    it('defaults to the spec recordType', async () => {
      await provider.connect();
      await provider.putDocument({ key: 'k', schemaVersion: 1, updatedAt: '', data: {} });
      const saveCall = mock.calls.find(c => c.method === 'saveRecord');
      expect((saveCall!.args[0] as { recordType: string }).recordType).toBe('SettingsDocument');
    });
  });

  describe('changeTag provenance (D2 preserved: explicit expectations only)', () => {
    it('plain put on an existing record sends no implicit changeTag; explicit expectedRevision is sent', async () => {
      await provider.connect();
      const first = await provider.putDocument({ key: 'tag-prov', schemaVersion: 1, updatedAt: '', data: { v: 1 } });

      await provider.putDocument(
        { key: 'tag-prov', schemaVersion: 1, updatedAt: '', data: { v: 2 } },
        { expectedRevision: first.revision },
      );

      // stale document revision without an explicit expectation must NOT become a precondition
      await provider.putDocument({
        key: 'tag-prov',
        schemaVersion: 1,
        updatedAt: '',
        revision: first.revision,
        data: { v: 3 },
      });

      const saves = mock.calls.filter(c => c.method === 'saveRecord');
      const explicit = saves[1]!.args[0] as { recordChangeTag?: string };
      expect(explicit.recordChangeTag).toBe(first.revision);

      const plain = saves[saves.length - 1]!.args[0] as { recordChangeTag?: string };
      expect(plain.recordChangeTag).toBeUndefined();
    });

    it('expectedRevision against a missing key rejects with ConflictError instead of silently creating', async () => {
      await provider.connect();
      await expect(
        provider.putDocument(
          { key: 'ghost', schemaVersion: 1, updatedAt: '', data: { v: 1 } },
          { expectedRevision: 'never-written' },
        ),
      ).rejects.toThrow(ConflictError);
      expect(await provider.getDocument('ghost')).toBeNull();
    });
  });

  describe('error-mapping matrix (raw client failures → coded taxonomy, D3 criterion 2)', () => {
    // bypass: fast-check not installed; deterministic error-mapping matrix
    // over raw failure shapes a real client surfaces (HTTP status and/or
    // in-band serverErrorCode).

    const AUTH_FAILURES: ReadonlyArray<{ label: string } & OperationFailure> = [
      { label: 'HTTP 401', httpStatus: 401, reason: 'unauthorized' },
      { label: 'HTTP 403', httpStatus: 403, reason: 'forbidden' },
      { label: 'in-band AUTHENTICATION_REQUIRED', serverErrorCode: 'AUTHENTICATION_REQUIRED', reason: 'sign in' },
      { label: 'in-band AUTHENTICATE_REQUIRED', serverErrorCode: 'AUTHENTICATE_REQUIRED', reason: 'sign in' },
    ];

    for (const failure of AUTH_FAILURES) {
      it(`maps ${failure.label} on fetch to AuthRequiredError`, async () => {
        await provider.connect();
        mock.setOperationFailure('fetch', failure);
        await expect(provider.getDocument('doc1')).rejects.toThrow(AuthRequiredError);
      });
    }

    const GENERIC_CASES: ReadonlyArray<{
      label: string;
      operation: 'fetch' | 'save' | 'delete' | 'query';
      code: string;
      run: (p: ICloudProvider) => Promise<unknown>;
    }> = [
      { label: 'getDocument()', operation: 'fetch', code: 'ICLOUD_RECORD_ERROR', run: p => p.getDocument('doc1') },
      {
        label: 'putDocument()',
        operation: 'save',
        code: 'ICLOUD_SAVE_ERROR',
        run: p => p.putDocument({ key: 'doc1', schemaVersion: 1, updatedAt: '', data: { v: 1 } }),
      },
      { label: 'deleteDocument()', operation: 'delete', code: 'ICLOUD_DELETE_ERROR', run: p => p.deleteDocument('doc1') },
      { label: 'listDocuments()', operation: 'query', code: 'ICLOUD_REQUEST_ERROR', run: p => p.listDocuments() },
    ];

    for (const scenario of GENERIC_CASES) {
      it(`wraps a generic ${scenario.label} failure in coded ${scenario.code} with cause`, async () => {
        await provider.connect();
        mock.setOperationFailure(scenario.operation, { serverErrorCode: 'UNKNOWN_ERROR', reason: 'boom' });
        const error = await captureRejection(scenario.run(provider));
        expect(error).toBeInstanceOf(SettingsStoreError);
        expect((error as SettingsStoreError).code).toBe(scenario.code);
        expect((error as SettingsStoreError).cause).toBeInstanceOf(Error);
      });
    }

    it('maps an in-band transport CONFLICT to ConflictError carrying the logical key (02-05 payload contract)', async () => {
      await provider.connect();
      mock.setOperationFailure('save', { serverErrorCode: 'CONFLICT', reason: 'conflict' });
      const error = await captureRejection(
        provider.putDocument({ key: 'logical-key', schemaVersion: 1, updatedAt: '', data: { v: 2 } }),
      );
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).key).toBe('logical-key');
    });

    it('deleteDocument() is idempotent when the client reports the record missing (NOT_FOUND)', async () => {
      await provider.connect();
      await expect(provider.deleteDocument('never-existed')).resolves.toBeUndefined();
    });
  });
});
