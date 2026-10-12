import {
  RecordBackedDocumentProvider,
  type CloudRecord,
  type ProviderId,
  type ConnectedProfile,
  type PutOptions,
} from '@storage-bridge/core';
import {
  DEFAULT_RECORD_TYPE,
  isNotFoundFailure,
  mapCloudKitError,
  type CloudKitClient,
  type CloudKitClientConfig,
} from './cloudkit-client.js';
import { CloudKitJsClient } from './cloudkit-js-client.js';
import { mapFromCloudRecord, mapToCloudRecord } from './record-mapper.js';

export interface ICloudProviderOptions {
  /**
   * Injected CloudKit client (D3). Defaults to the CloudKit JS web adapter
   * (Apple web sign-in); tests inject the port-level fake.
   */
  client?: CloudKitClient;
  config: CloudKitClientConfig;
  /** Apple web api token — required when the default CloudKit JS client is used. */
  apiToken?: string;
  /** CloudKit record type (spec :75-77). */
  recordType?: string;
}

export class ICloudProvider extends RecordBackedDocumentProvider {
  readonly id: ProviderId = 'icloud';
  private readonly client: CloudKitClient;
  private readonly config: CloudKitClientConfig;
  private readonly recordType: string;
  /**
   * Honest lifecycle: the provider flag AND the client's authenticated state
   * both gate isConnected() (02-08), so a session lost underneath the
   * provider surfaces truthfully.
   */
  private connected = false;

  constructor(options: ICloudProviderOptions) {
    super();
    this.client =
      options.client ??
      new CloudKitJsClient({
        containerIdentifier: options.config.containerIdentifier,
        environment: options.config.environment,
        apiToken: options.apiToken,
      });
    this.config = options.config;
    this.recordType = options.recordType ?? DEFAULT_RECORD_TYPE;
  }

  async connect(): Promise<void> {
    try {
      await this.client.setUp(this.config);
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw mapCloudKitError(error, 'ICLOUD_REQUEST_ERROR');
    }
  }

  async disconnect(): Promise<void> {
    await this.client.tearDown();
    this.connected = false;
  }

  async isConnected(): Promise<boolean> {
    return this.connected && this.client.isAuthenticated();
  }

  async getProfile(): Promise<ConnectedProfile | null> {
    // Port contract (matches the shared suite's honest-lifecycle family):
    // null while disconnected; when connected, only the provider identity —
    // CloudKit exposes no account/email/display name without a user-facing
    // discoverIdentity call, so nothing is fabricated here.
    if (!(await this.isConnected())) return null;
    return { provider: 'icloud' };
  }

  protected async getRecord(key: string): Promise<CloudRecord | null> {
    try {
      const raw = await this.client.fetchRecord(key, this.recordType);
      if (!raw || raw.deleted) return null;
      return mapToCloudRecord(raw);
    } catch (error) {
      throw mapCloudKitError(error, 'ICLOUD_RECORD_ERROR');
    }
  }

  protected async saveRecord(record: CloudRecord, _options?: PutOptions): Promise<CloudRecord> {
    // D2: changeTag provenance lives in RecordBackedDocumentProvider — the
    // record arrives with the changeTag already set from explicit caller
    // expectations only (never the document's own revision).
    try {
      const raw = mapFromCloudRecord(record, this.recordType);
      const saved = await this.client.saveRecord(raw);
      return mapToCloudRecord(saved);
    } catch (error) {
      // Conflict payload is the logical record name — never a message
      // sentence (02-06 conflict-payload contract).
      throw mapCloudKitError(error, 'ICLOUD_SAVE_ERROR', record.recordName);
    }
  }

  protected async removeRecord(key: string): Promise<void> {
    try {
      await this.client.deleteRecord(key, this.recordType);
    } catch (error) {
      // CloudKit throws for missing records — treat as idempotent (spec §ICloudProvider).
      if (isNotFoundFailure(error)) return;
      throw mapCloudKitError(error, 'ICLOUD_DELETE_ERROR');
    }
  }

  protected async listRecords(): Promise<CloudRecord[]> {
    try {
      const raws = await this.client.queryRecords(this.recordType);
      return raws.filter(r => !r.deleted).map(mapToCloudRecord);
    } catch (error) {
      throw mapCloudKitError(error, 'ICLOUD_REQUEST_ERROR');
    }
  }
}
