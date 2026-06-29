import { describe, it, expect, beforeEach } from 'vitest';
import { ICloudProvider } from '../icloud-provider.js';
import { createCloudKitApiMock } from './icloud-api-mock.js';

describe('ICloudProvider', () => {
  let apiMock: ReturnType<typeof createCloudKitApiMock>;
  let provider: ICloudProvider;

  beforeEach(() => {
    apiMock = createCloudKitApiMock();

    const globalWithApplePay = globalThis as typeof globalThis & { ApplePaySession?: unknown };
    globalWithApplePay.ApplePaySession = {};

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
      const globalWithApplePay = globalThis as typeof globalThis & { ApplePaySession?: unknown };
      delete globalWithApplePay.ApplePaySession;
      expect(provider.isSupported()).toBe(false);
    });
  });

  describe('Connection', () => {
    it('connect is a no-op but works', async () => {
      await expect(provider.connect()).resolves.toBeUndefined();
    });

    it('disconnect is a no-op but works', async () => {
      await expect(provider.disconnect()).resolves.toBeUndefined();
    });

    it('isConnected is always true', async () => {
      expect(await provider.isConnected()).toBe(true);
    });

    it('getProfile returns mock data', async () => {
      const profile = await provider.getProfile();
      expect(profile).toEqual({
        provider: 'icloud',
        accountId: 'icloud-user',
        displayName: 'iCloud User',
        email: 'user@icloud.com'
      });
    });
  });

  describe('Record operations', () => {
    it('can get, save, and list records using RecordBackedDocumentProvider methods', async () => {
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
});
