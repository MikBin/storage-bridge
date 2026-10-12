import { SettingsStoreError } from '@storage-bridge/core';
import {
  isNotFoundFailure,
  mapCloudKitError,
  type CloudKitClient,
  type CloudKitClientConfig,
  type CloudKitRecordRaw,
} from './cloudkit-client.js';

/**
 * CloudKit JS adapter for the injected CloudKitClient port (D3, spec §2/§7).
 *
 * Owns Apple web sign-in: setUp() configures the container with the web api
 * token and completes sign-in via container.setUpAuth(). Auth failures
 * (401/403, AUTHENTICATION_REQUIRED) map to AuthRequiredError; every other
 * failure wraps the coded ICLOUD_* taxonomy with a populated cause.
 *
 * OPERATOR-BLOCKED (real-API verification): exercising this adapter against
 * the real CloudKit JS service requires Apple web-auth-token provisioning
 * (Apple Developer account, container identifier, web api token and the
 * sign-in redirect origin). Until provisioned, verification is mock-based —
 * cloudkit-js-client.test.ts pins the adapter's call shapes against a fake
 * globalThis.CloudKit.
 *
 * CloudKit JS is a browser global loaded via script tag (NOT an npm
 * dependency); every access is defensive so a runtime without the global
 * yields an actionable error instead of a crash.
 */

export interface CloudKitJsClientOptions {
  containerIdentifier: string;
  /** Apple web api token (CloudKit Dashboard). Required for setUp(). */
  apiToken?: string;
  environment?: 'development' | 'production';
}

interface CloudKitJsDatabase {
  fetchRecordWithName?(recordName: string): Promise<unknown>;
  saveRecords?(records: unknown[], options?: unknown): Promise<{ records?: unknown[] }>;
  deleteRecordWithName?(recordName: string): Promise<unknown>;
  performQuery?(
    query: unknown,
    options?: unknown,
  ): Promise<{ records?: unknown[]; continuationMarker?: unknown }>;
}

interface CloudKitJsContainer {
  containerIdentifier?: string;
  /** Apple web sign-in (redirect/popup); resolves with the user identity. */
  setUpAuth?(options?: unknown): Promise<unknown>;
  privateCloudDatabase?: CloudKitJsDatabase;
}

interface CloudKitJsGlobal {
  configure(config: unknown): void;
  getDefaultContainer(): CloudKitJsContainer;
}

function requireCloudKitGlobal(): CloudKitJsGlobal {
  const global = (globalThis as { CloudKit?: CloudKitJsGlobal }).CloudKit;
  if (!global) {
    throw new SettingsStoreError(
      "CloudKit JS is not available in this runtime. Load Apple's cloudkit.js script (web) or run inside the " +
        'Apple runtime bridge. Real-API verification is operator-blocked pending Apple web-auth-token provisioning (D3).',
      'ICLOUD_REQUEST_ERROR',
    );
  }
  return global;
}

function hasServerErrorCode(result: unknown): boolean {
  return typeof (result as Record<string, unknown> | null)?.serverErrorCode === 'string';
}

export class CloudKitJsClient implements CloudKitClient {
  private readonly apiToken?: string;
  private container: CloudKitJsContainer | undefined;
  private signedIn = false;

  constructor(options: CloudKitJsClientOptions) {
    this.apiToken = options.apiToken;
  }

  async setUp(config: CloudKitClientConfig): Promise<void> {
    try {
      if (!this.apiToken) {
        throw new SettingsStoreError(
          'CloudKit JS adapter requires an Apple web apiToken (CloudKit Dashboard → API token). ' +
            'Real-API verification is operator-blocked pending Apple web-auth-token provisioning (D3).',
          'ICLOUD_REQUEST_ERROR',
        );
      }
      const CloudKit = requireCloudKitGlobal();
      CloudKit.configure({
        containers: [{ containerIdentifier: config.containerIdentifier, apiToken: this.apiToken }],
        environment: config.environment ?? 'production',
      });
      const container = CloudKit.getDefaultContainer();
      const setUpAuth = container.setUpAuth;
      if (typeof setUpAuth !== 'function') {
        throw new SettingsStoreError(
          'CloudKit JS container does not expose setUpAuth — cannot perform Apple web sign-in',
          'ICLOUD_REQUEST_ERROR',
        );
      }
      // Apple web sign-in: resolves with the user identity once signed in.
      const identity = await setUpAuth.call(container);
      this.container = container;
      this.signedIn = identity !== null && identity !== undefined;
    } catch (error) {
      this.container = undefined;
      this.signedIn = false;
      throw mapCloudKitError(error, 'ICLOUD_REQUEST_ERROR');
    }
  }

  async tearDown(): Promise<void> {
    this.container = undefined;
    this.signedIn = false;
  }

  isAuthenticated(): boolean {
    return this.signedIn;
  }

  async fetchRecord(recordName: string, _recordType: string): Promise<CloudKitRecordRaw | null> {
    const db = this.database();
    // The JS API keys lookups by recordName alone; _recordType stays in the
    // signature for port conformance (spec lines 121-142).
    const fetch = this.expectDbFunction(db, 'fetchRecordWithName');
    try {
      const result = await fetch.call(db, recordName);
      if (result === null || result === undefined) return null;
      if (hasServerErrorCode(result)) {
        throw mapCloudKitError(result, 'ICLOUD_RECORD_ERROR', recordName);
      }
      return result as CloudKitRecordRaw;
    } catch (error) {
      if (isNotFoundFailure(error)) return null;
      throw mapCloudKitError(error, 'ICLOUD_RECORD_ERROR', recordName);
    }
  }

  async saveRecord(record: CloudKitRecordRaw): Promise<CloudKitRecordRaw> {
    const db = this.database();
    const save = this.expectDbFunction(db, 'saveRecords');
    try {
      const response = await save.call(db, [record]);
      const saved = response?.records?.[0];
      if (saved === null || saved === undefined) {
        throw new SettingsStoreError(
          `CloudKit save returned no result for ${record.recordName}`,
          'ICLOUD_SAVE_ERROR',
        );
      }
      if (hasServerErrorCode(saved)) {
        throw mapCloudKitError(saved, 'ICLOUD_SAVE_ERROR', record.recordName);
      }
      return saved as CloudKitRecordRaw;
    } catch (error) {
      throw mapCloudKitError(error, 'ICLOUD_SAVE_ERROR', record.recordName);
    }
  }

  async deleteRecord(recordName: string, _recordType: string): Promise<void> {
    const db = this.database();
    const remove = this.expectDbFunction(db, 'deleteRecordWithName');
    try {
      await remove.call(db, recordName);
    } catch (error) {
      // CloudKit rejects for missing records — idempotent delete (spec §ICloudProvider).
      if (isNotFoundFailure(error)) return;
      throw mapCloudKitError(error, 'ICLOUD_DELETE_ERROR');
    }
  }

  async queryRecords(recordType: string): Promise<CloudKitRecordRaw[]> {
    const db = this.database();
    const query = this.expectDbFunction(db, 'performQuery');
    const records: CloudKitRecordRaw[] = [];
    // Full pagination: CloudKit queries answer with continuationMarker while
    // more pages remain; re-query with the marker until it is absent so large
    // record sets are never silently truncated (02-03 continuation shape).
    let continuationMarker: string | undefined;
    do {
      const options = continuationMarker !== undefined ? { continuationMarker } : undefined;
      let page: { records?: unknown[]; continuationMarker?: unknown };
      try {
        page = await query.call(db, { recordType }, options);
      } catch (error) {
        throw mapCloudKitError(error, 'ICLOUD_REQUEST_ERROR');
      }
      for (const record of page.records ?? []) {
        if (!hasServerErrorCode(record)) records.push(record as CloudKitRecordRaw);
      }
      continuationMarker =
        typeof page.continuationMarker === 'string' && page.continuationMarker.length > 0
          ? page.continuationMarker
          : undefined;
    } while (continuationMarker !== undefined);
    return records;
  }

  private database(): CloudKitJsDatabase {
    if (!this.container) {
      throw new SettingsStoreError(
        'CloudKit container not initialized — call setUp() before record operations',
        'ICLOUD_REQUEST_ERROR',
      );
    }
    const db = this.container.privateCloudDatabase;
    if (!db) {
      throw new SettingsStoreError(
        'CloudKit private database unavailable on the default container',
        'ICLOUD_REQUEST_ERROR',
      );
    }
    return db;
  }

  private expectDbFunction<K extends keyof CloudKitJsDatabase>(
    db: CloudKitJsDatabase,
    name: K,
  ): NonNullable<CloudKitJsDatabase[K]> {
    const fn = db[name];
    if (typeof fn !== 'function') {
      throw new SettingsStoreError(
        `CloudKit JS private database does not expose ${String(name)}`,
        'ICLOUD_REQUEST_ERROR',
      );
    }
    return fn as NonNullable<CloudKitJsDatabase[K]>;
  }
}
