import { ConflictError } from '@storage-bridge/core';
import type { CloudKitRecord } from './record-mapper.js';

export interface CloudKitConfig {
  apiToken: string;
  containerId: string;
  environment?: 'development' | 'production';
  fetchFn?: typeof fetch;
}

export class CloudKitClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly apiToken: string;

  constructor(config: CloudKitConfig) {
    const environment = config.environment || 'production';
    this.apiToken = config.apiToken;
    this.fetchFn = config.fetchFn || globalThis.fetch.bind(globalThis);

    // Construct CloudKit Web Services URL
    // Format: https://api.apple-cloudkit.com/database/1/[containerId]/[environment]/private
    this.baseUrl = `https://api.apple-cloudkit.com/database/1/${config.containerId}/${environment}/private`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async request(endpoint: string, body: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}?ckAPIToken=${this.apiToken}`;

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`CloudKit API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getRecord(recordName: string): Promise<CloudKitRecord | null> {
    const data = await this.request('/records/lookup', {
      records: [{ recordName }]
    });

    const record = data.records?.[0];
    if (!record || record.serverErrorCode === 'NOT_FOUND') {
      return null;
    }

    if (record.serverErrorCode) {
      throw new Error(`CloudKit error: ${record.serverErrorCode} - ${record.reason}`);
    }

    return record;
  }

  async saveRecord(record: CloudKitRecord): Promise<CloudKitRecord> {
    const operationType = record.recordChangeTag ? 'update' : 'create';

    const data = await this.request('/records/modify', {
      operations: [{
        operationType,
        record
      }]
    });

    const result = data.records?.[0];

    if (result?.serverErrorCode === 'CONFLICT') {
      throw new ConflictError(`Conflict when saving record ${record.recordName}`);
    }

    if (!result || result.serverErrorCode) {
      throw new Error(`CloudKit save error: ${result?.serverErrorCode} - ${result?.reason}`);
    }

    return result;
  }

  async removeRecord(recordName: string): Promise<void> {
    const data = await this.request('/records/modify', {
      operations: [{
        operationType: 'delete',
        record: { recordName }
      }]
    });

    const result = data.records?.[0];

    // Ignore if already deleted/not found
    if (result && result.serverErrorCode === 'NOT_FOUND') {
      return;
    }

    if (!result || (result.serverErrorCode && result.serverErrorCode !== 'NOT_FOUND')) {
      throw new Error(`CloudKit delete error: ${result?.serverErrorCode} - ${result?.reason}`);
    }
  }

  async listRecords(): Promise<CloudKitRecord[]> {
    const data = await this.request('/records/query', {
      query: {
        recordType: 'SettingsDocument'
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.records || []).filter((r: any) => !r.serverErrorCode);
  }
}
