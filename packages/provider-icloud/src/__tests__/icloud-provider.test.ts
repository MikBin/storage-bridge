import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictError } from '@storage-bridge/core';
import { ICloudProvider } from '../icloud-provider.js';
import { createCloudKitApiMock } from './icloud-api-mock.js';

describe('ICloudProvider', () => {
  let apiMock: ReturnType<typeof createCloudKitApiMock>;
  let provider: ICloudProvider;

  beforeEach(() => {
    apiMock = createCloudKitApiMock();

    // Set up environment so isSupported() returns true
    (globalThis as any).ApplePaySession = {};

    provider = new ICloudProvider({
      apiToken: 'test-token',
      containerId: 'iCloud.com.test.container',
      environment: 'development',
      fetchFn: apiMock.fetchFn
    });
  });

  describe('isSupported', () => {
    it('returns true when Apple environment is detected', () => {
      expect(provider.isSupported()).toBe(true);
    });

    it('returns false when Apple environment is not detected', () => {
      delete (globalThis as any).ApplePaySession;
      expect(provider.isSupported()).toBe(false);
    });
  });

  describe('Connection', () => {
    it('connect succeeds', async () => {
      await expect(provider.connect()).resolves.toBeUndefined();
    });

    it('disconnect succeeds', async () => {
      await expect(provider.disconnect()).resolves.toBeUndefined();
    });

    it('isConnected reflects the connect/disconnect flag (02-06 uniform pre-connect policy)', async () => {
      expect(await provider.isConnected()).toBe(false);
      await provider.connect();
      expect(await provider.isConnected()).toBe(true);
      await provider.disconnect();
      expect(await provider.isConnected()).toBe(false);
    });

    it('getProfile returns null when disconnected and only the provider identity when connected', async () => {
      expect(await provider.getProfile()).toBeNull();

      await provider.connect();
      expect(await provider.getProfile()).toEqual({ provider: 'icloud' });

      await provider.disconnect();
      expect(await provider.getProfile()).toBeNull();
    });
  });

  describe('Record operations', () => {
    it('can get, save, and list records using RecordBackedDocumentProvider methods', async () => {
      await provider.connect();
      // Create record
      const doc = await provider.putDocument({
        key: 'settings',
        schemaVersion: 1,
        updatedAt: '',
        data: { theme: 'dark' }
      });

      expect(doc.key).toBe('settings');
      expect(doc.revision).toBeDefined();

      // Read record
      const retrieved = await provider.getDocument('settings');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.data).toEqual({ theme: 'dark' });

      // List records
      const list = await provider.listDocuments();
      expect(list).toHaveLength(1);
      expect(list[0].key).toBe('settings');

      // Delete record
      await provider.deleteDocument('settings');
      const afterDelete = await provider.getDocument('settings');
      expect(afterDelete).toBeNull();
    });
  });

  describe('changeTag provenance (D2: explicit expectations only)', () => {
    function extractModifyBodies(): Array<{ operationType: string; recordChangeTag?: string }> {
      return apiMock.fetchFn.mock.calls
        .filter(([url]) => String(url).includes('/records/modify'))
        .map(([, init]) => {
          const body = JSON.parse((init as RequestInit).body as string);
          const operation = body.operations[0];
          return {
            operationType: operation.operationType,
            recordChangeTag: operation.record?.recordChangeTag,
          };
        });
    }

    it('plain putDocument on an existing record does not send an implicit changeTag', async () => {
      await provider.connect();
      const first = await provider.putDocument({ key: 'tag-prov', schemaVersion: 1, updatedAt: '', data: { v: 1 } });

      // Simulate the legacy manager envelope: the document carries its own
      // (now stale) revision, but the caller passed no explicit expectation.
      const advanced = await provider.putDocument(
        { key: 'tag-prov', schemaVersion: 1, updatedAt: '', data: { v: 2 } },
        { expectedRevision: first.revision },
      );
      expect(advanced.revision).not.toBe(first.revision);

      await expect(
        provider.putDocument({
          key: 'tag-prov',
          schemaVersion: 1,
          updatedAt: '',
          revision: first.revision, // stale document revision
          data: { v: 3 },
        }),
      ).resolves.toBeDefined();

      const modifies = extractModifyBodies();
      const plainPut = modifies[modifies.length - 1];
      expect(plainPut.operationType).toBe('create');
      expect(plainPut.recordChangeTag).toBeUndefined();
    });

    it('explicit expectedRevision is sent as the recordChangeTag', async () => {
      await provider.connect();
      const first = await provider.putDocument({ key: 'tag-explicit', schemaVersion: 1, updatedAt: '', data: { v: 1 } });

      await provider.putDocument(
        { key: 'tag-explicit', schemaVersion: 1, updatedAt: '', data: { v: 2 } },
        { expectedRevision: first.revision },
      );

      const modifies = extractModifyBodies();
      expect(modifies[1].operationType).toBe('update');
      expect(modifies[1].recordChangeTag).toBe(first.revision);
    });

    it('expectedRevision against a missing record rejects with ConflictError instead of silently creating', async () => {
      await provider.connect();
      await expect(
        provider.putDocument(
          { key: 'ghost-record', schemaVersion: 1, updatedAt: '', data: { v: 1 } },
          { expectedRevision: 'revision-of-a-never-written-key' },
        ),
      ).rejects.toThrow(ConflictError);
      expect(await provider.getDocument('ghost-record')).toBeNull();
    });
  });
});
