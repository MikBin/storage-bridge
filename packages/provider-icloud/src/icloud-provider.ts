import { RecordBackedDocumentProvider, type CloudRecord, type ProviderId, type ConnectedProfile, type PutOptions } from '@storage-bridge/core';
import { CloudKitClient, type CloudKitConfig } from './cloudkit-client.js';
import { mapFromCloudRecord, mapToCloudRecord } from './record-mapper.js';

export class ICloudProvider extends RecordBackedDocumentProvider {
  readonly id: ProviderId = 'icloud';
  private readonly client: CloudKitClient;
  /**
   * Minimal connection flag (02-06 uniform pre-connect policy): data ops
   * before connect() reject NotConnectedError. The full honest lifecycle
   * (getProfile truth, fabricated state removal) stays with step 02-08.
   */
  private connected = false;

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
    // CloudKit uses container authentication — only the local flag flips.
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  async getProfile(): Promise<ConnectedProfile | null> {
    // Port contract (matches the shared suite's honest-lifecycle family):
    // null while disconnected; when connected, only the provider identity —
    // CloudKit exposes no account/email/display name without a user-facing
    // discoverIdentity call, so nothing is fabricated here.
    if (!this.connected) {
      return null;
    }
    return { provider: 'icloud' };
  }

  public async getRecord(key: string): Promise<CloudRecord | null> {
    const ckRecord = await this.client.getRecord(key);
    if (!ckRecord) return null;
    return mapToCloudRecord(ckRecord);
  }

  public async saveRecord(record: CloudRecord, _options?: PutOptions): Promise<CloudRecord> {
    // D2: changeTag provenance lives in RecordBackedDocumentProvider — the
    // record arrives with the changeTag already set from explicit caller
    // expectations only (never the document's own revision).
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
