import { AuthRequiredError, ConflictError, SettingsStoreError } from '@storage-bridge/core';

/**
 * Injected CloudKitClient port (D3, spec 2026-04-15-icloud-provider-design.md
 * §CloudKitClient lines 121-142). ICloudProvider consumes this abstraction —
 * the real CloudKit JS implementation lives in cloudkit-js-client.ts, tests
 * inject the port-level fake.
 */

/** Raw CloudKit record shape from the API. CloudKit fields are typed; the
 * document envelope travels as JSON inside the single string `payload` field. */
export interface CloudKitField {
  value: unknown;
}

export interface CloudKitRecordRaw {
  recordName: string;
  recordType: string;
  recordChangeTag?: string;
  created?: { timestamp: number };
  modified?: { timestamp: number };
  fields: Record<string, CloudKitField>;
  deleted?: boolean;
}

export interface CloudKitClientConfig {
  containerIdentifier: string;
  environment?: 'development' | 'production';
}

export const DEFAULT_RECORD_TYPE = 'SettingsDocument';

/**
 * Abstracts CloudKit record operations.
 * Injected into ICloudProvider — mock for tests, real CloudKit JS for web, native bridge for RN.
 */
export interface CloudKitClient {
  /** Authenticate and configure the CloudKit container (Apple web sign-in on the JS adapter). */
  setUp(config: CloudKitClientConfig): Promise<void>;

  /** Tear down the session. */
  tearDown(): Promise<void>;

  /** Whether the client is currently authenticated. */
  isAuthenticated(): boolean;

  /** Fetch a single record by name from the private database; null when missing. */
  fetchRecord(recordName: string, recordType: string): Promise<CloudKitRecordRaw | null>;

  /** Save (create or update) a record. */
  saveRecord(record: CloudKitRecordRaw): Promise<CloudKitRecordRaw>;

  /** Delete a record by name. */
  deleteRecord(recordName: string, recordType: string): Promise<void>;

  /** Query all records of the given type (continuation pagination is an internal client detail). */
  queryRecords(recordType: string): Promise<CloudKitRecordRaw[]>;
}

/**
 * Checks whether CloudKit is available in the current runtime (spec
 * §Runtime Detection :287-301). True when window.CloudKit exists (CloudKit JS
 * loaded) or a native iCloud bridge is detected. Standalone export — provider
 * support is gated through this, never through UA sniffing.
 */
export function isAppleRuntime(): boolean {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as Record<string, unknown>;
    if (g.CloudKit) return true;
    if (g.__STORAGE_BRIDGE_ICLOUD_NATIVE__) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Shared error mapping (D3 criterion 2): raw transport failures surface as
// coded SettingsStoreErrors — 401/403 and AUTHENTICATION_REQUIRED(ly) map to
// AuthRequiredError, CONFLICT maps to ConflictError (payload = logical key,
// 02-05 semantics), everything else wraps the coded ICLOUD_* taxonomy with a
// populated cause (02-06 codes preserved).
// ---------------------------------------------------------------------------

const AUTH_HTTP_STATUSES: ReadonlySet<number> = new Set([401, 403]);
const AUTH_SERVER_ERROR_CODES: ReadonlySet<string> = new Set([
  'AUTHENTICATION_REQUIRED',
  'AUTHENTICATE_REQUIRED',
]);
const CONFLICT_SERVER_ERROR_CODES: ReadonlySet<string> = new Set([
  'CONFLICT',
  'NOT_FOUND_EXISTING',
]);
const NOT_FOUND_SERVER_ERROR_CODES: ReadonlySet<string> = new Set(['NOT_FOUND', 'UNKNOWN_ITEM']);

function failureProperty(error: unknown, property: string): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as Record<string, unknown>)[property];
}

function readHttpStatus(error: unknown): number | undefined {
  const status = failureProperty(error, 'httpStatus') ?? failureProperty(error, 'status');
  return typeof status === 'number' ? status : undefined;
}

function readServerErrorCode(error: unknown): string | undefined {
  const code = failureProperty(error, 'serverErrorCode');
  return typeof code === 'string' ? code : undefined;
}

function isAuthFailure(error: unknown): boolean {
  const status = readHttpStatus(error);
  if (status !== undefined && AUTH_HTTP_STATUSES.has(status)) return true;
  const code = readServerErrorCode(error);
  return code !== undefined && AUTH_SERVER_ERROR_CODES.has(code);
}

function isConflictFailure(error: unknown): boolean {
  const code = readServerErrorCode(error);
  return code !== undefined && CONFLICT_SERVER_ERROR_CODES.has(code);
}

export function isNotFoundFailure(error: unknown): boolean {
  const code = readServerErrorCode(error);
  return code !== undefined && NOT_FOUND_SERVER_ERROR_CODES.has(code);
}

/**
 * Maps a raw client failure to the coded store-error taxonomy. An error that
 * is already a SettingsStoreError (e.g. mapped by the concrete adapter) passes
 * through untouched so codes are never double-wrapped.
 */
export function mapCloudKitError(
  error: unknown,
  fallbackCode: string,
  conflictKey?: string,
): SettingsStoreError {
  if (error instanceof SettingsStoreError) return error;
  if (isAuthFailure(error)) return new AuthRequiredError('icloud');
  if (conflictKey !== undefined && isConflictFailure(error)) return new ConflictError(conflictKey);
  const reason = error instanceof Error ? error.message : String(error);
  return new SettingsStoreError(`CloudKit operation failed: ${reason}`, fallbackCode, error);
}
