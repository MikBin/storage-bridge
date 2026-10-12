import { ConflictError, SettingsStoreError } from '@storage-bridge/core';
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
      // 5xx and other transport failures surface as a coded SettingsStoreError
      // so callers can distinguish a server outage from a silent empty result.
      // The response detail (status + body excerpt) is chained as cause (02-06).
      const excerpt = (await response.text().catch(() => '')).slice(0, 200);
      throw new SettingsStoreError(
        `CloudKit API error: ${response.status} ${response.statusText}`,
        'ICLOUD_REQUEST_ERROR',
        new Error(`HTTP ${response.status}: ${excerpt || '<no body>'}`),
      );
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
      // In-band CloudKit application errors are coded store failures too —
      // a raw Error must never escape the client boundary (02-06).
      throw new SettingsStoreError(
        `CloudKit record lookup failed: ${recordName}`,
        'ICLOUD_RECORD_ERROR',
        new Error(`${record.serverErrorCode} - ${record.reason}`),
      );
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
      // Payload is the logical record name — never a message sentence (02-06,
      // conflict-payload contract).
      throw new ConflictError(record.recordName);
    }

    if (!result || result.serverErrorCode) {
      throw new SettingsStoreError(
        `CloudKit record save failed: ${record.recordName}`,
        'ICLOUD_SAVE_ERROR',
        new Error(`${result?.serverErrorCode ?? 'NO_RESULT'} - ${result?.reason ?? 'no result returned'}`),
      );
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
      throw new SettingsStoreError(
        `CloudKit record delete failed: ${recordName}`,
        'ICLOUD_DELETE_ERROR',
        new Error(`${result?.serverErrorCode ?? 'NO_RESULT'} - ${result?.reason ?? 'no result returned'}`),
      );
    }
  }

  async listRecords(): Promise<CloudKitRecord[]> {
    const records: CloudKitRecord[] = [];
    let continuationMarker: string | undefined;

    // Full pagination: CloudKit queries answer with continuationMarker while
    // more pages remain (server may also cap each page via resultsLimit);
    // re-query with the marker until it is absent so large record sets are
    // never silently truncated. The client's public shape stays a single
    // Promise<CloudKitRecord[]> — continuation is an internal detail.
    do {
      const data = await this.request('/records/query', {
        query: {
          recordType: 'SettingsDocument'
        },
        ...(continuationMarker !== undefined ? { continuationMarker } : {})
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      records.push(...((data.records ?? []) as any[]).filter((r: any) => !r.serverErrorCode));
      continuationMarker = typeof data.continuationMarker === 'string' ? data.continuationMarker : undefined;
    } while (continuationMarker !== undefined);

    return records;
  }
}
