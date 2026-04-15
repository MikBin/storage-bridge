import { RecordBackedDocumentProvider, type CloudRecord, type ProviderId, type ConnectedProfile, type PutOptions } from '@storage-bridge/core';
import { CloudKitClient, type CloudKitConfig } from './cloudkit-client.js';
import { mapFromCloudRecord, mapToCloudRecord } from './record-mapper.js';

export class ICloudProvider extends RecordBackedDocumentProvider {
  readonly id: ProviderId = 'icloud';
  private readonly client: CloudKitClient;

  constructor(config: CloudKitConfig) {
    super();
    this.client = new CloudKitClient(config);
  }

  isSupported(): boolean {
    if (typeof globalThis !== 'undefined') {
      if ('ApplePaySession' in globalThis) {
        return true;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userAgent = (globalThis as any).navigator?.userAgent || '';
      if (/Mac OS X|iPhone|iPad|iPod/.test(userAgent)) {
         return true;
      }
    }
    return false;
  }

  async connect(): Promise<void> {
    // CloudKit uses container authentication, nothing to do here
  }

  async disconnect(): Promise<void> {
    // CloudKit uses container authentication, nothing to do here
  }

  async isConnected(): Promise<boolean> {
    // CloudKit REST APIs are stateless, so we're always "connected" if we have config
    return true;
  }

  async getProfile(): Promise<ConnectedProfile | null> {
    return {
      provider: 'icloud',
      accountId: 'icloud-user',
      displayName: 'iCloud User',
      email: 'user@icloud.com'
    };
  }

  public async getRecord(key: string): Promise<CloudRecord | null> {
    const ckRecord = await this.client.getRecord(key);
    if (!ckRecord) return null;
    return mapToCloudRecord(ckRecord);
  }

  public async saveRecord(record: CloudRecord, options?: PutOptions): Promise<CloudRecord> {
    if (options?.expectedRevision) {
      record.changeTag = options.expectedRevision;
    }

    const ckRecord = mapFromCloudRecord(record);
    const saved = await this.client.saveRecord(ckRecord);
    return mapToCloudRecord(saved);
  }

  public async removeRecord(key: string): Promise<void> {
    await this.client.removeRecord(key);
  }

  public async listRecords(): Promise<CloudRecord[]> {
    const records = await this.client.listRecords();
    return records.map(mapToCloudRecord);
  }
}
