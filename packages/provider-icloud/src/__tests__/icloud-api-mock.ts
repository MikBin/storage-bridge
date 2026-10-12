import type {
  CloudKitClient,
  CloudKitClientConfig,
  CloudKitRecordRaw,
} from '../cloudkit-client.js';

/**
 * Raw failure shape a real CloudKit transport surfaces: an HTTP status
 * (transport-level) and/or an in-band `serverErrorCode` (application-level).
 * The provider's error-mapping matrix consumes both channels.
 */
export class CloudKitMockError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly serverErrorCode?: string,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = 'CloudKitMockError';
  }
}

export interface MockCloudKitState {
  records: Record<string, CloudKitRecordRaw>;
  counter: number;
}

export type MockOperation = 'fetch' | 'save' | 'delete' | 'query';

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface OperationFailure {
  serverErrorCode?: string;
  httpStatus?: number;
  reason: string;
}

/**
 * In-memory fake of the injected CloudKitClient port (spec
 * 2026-04-15-icloud-provider-design.md §CloudKitClient, D3).
 *
 * The fake validates inputs like the real transport (non-empty recordName /
 * recordType) and preserves the behaviors the wire emulation historically
 * provided: pagination continuation (02-03), global 5xx outages,
 * operation-scoped in-band server errors, conflict emulation (02-05) and web
 * sign-in auth failures (D3).
 */
export interface CloudKitClientMock extends CloudKitClient {
  reset(state?: MockCloudKitState): void;
  getState(): MockCloudKitState;
  /** Emulated server-side page size for queryRecords; null serves everything in one page. */
  setListPageSize(pageSize: number | null): void;
  /** Makes every port operation throw a transport-level `status` failure until cleared. */
  setGlobalFailure(status: number | null): void;
  /** Makes the matching operation answer with an in-band CloudKit failure. */
  setOperationFailure(operation: MockOperation, failure: OperationFailure): void;
  /** Makes the next setUp() answer with an Apple web sign-in requirement. */
  setAuthRequired(): void;
  readonly calls: RecordedCall[];
}

export function createCloudKitClientMock(
  initialState: MockCloudKitState = { records: {}, counter: 0 },
): CloudKitClientMock {
  let state: MockCloudKitState = {
    records: { ...initialState.records },
    counter: initialState.counter,
  };
  let listPageSize: number | null = null;
  let globalFailureStatus: number | null = null;
  let operationFailure: { operation: MockOperation; failure: OperationFailure } | null = null;
  let authRequired = false;
  let authenticated = false;
  const calls: RecordedCall[] = [];

  function recordCall(method: string, args: unknown[]): void {
    calls.push({ method, args });
  }

  function failGlobal(operation: string): void {
    if (globalFailureStatus !== null) {
      throw new CloudKitMockError(
        `${operation} failed: HTTP ${globalFailureStatus} server outage`,
        globalFailureStatus,
        'SERVICE_UNAVAILABLE',
        'server outage',
      );
    }
  }

  function failOperation(operation: MockOperation, recordName: string): void {
    if (operationFailure !== null && operationFailure.operation === operation) {
      const { failure } = operationFailure;
      throw new CloudKitMockError(
        `${operation} failed for ${recordName}: ${failure.serverErrorCode ?? failure.httpStatus ?? 'FAILURE'} - ${failure.reason}`,
        failure.httpStatus,
        failure.serverErrorCode,
        failure.reason,
      );
    }
  }

  return {
    calls,
    reset(newState: MockCloudKitState = { records: {}, counter: 0 }) {
      state = { records: { ...newState.records }, counter: newState.counter };
      listPageSize = null;
      globalFailureStatus = null;
      operationFailure = null;
      authRequired = false;
      authenticated = false;
      calls.length = 0;
    },
    getState() {
      return state;
    },
    setListPageSize(pageSize: number | null) {
      listPageSize = pageSize;
    },
    setGlobalFailure(status: number | null) {
      globalFailureStatus = status;
    },
    setOperationFailure(operation: MockOperation, failure: OperationFailure) {
      operationFailure = { operation, failure };
    },
    setAuthRequired() {
      authRequired = true;
    },

    async setUp(config: CloudKitClientConfig): Promise<void> {
      recordCall('setUp', [config]);
      failGlobal('setUp');
      if (authRequired) {
        throw new CloudKitMockError(
          'setUp failed: Apple ID web sign-in required',
          401,
          'AUTHENTICATION_REQUIRED',
          'web sign-in required',
        );
      }
      authenticated = true;
    },

    async tearDown(): Promise<void> {
      recordCall('tearDown', []);
      authenticated = false;
    },

    isAuthenticated(): boolean {
      return authenticated;
    },

    async fetchRecord(recordName: string, recordType: string): Promise<CloudKitRecordRaw | null> {
      recordCall('fetchRecord', [recordName, recordType]);
      failGlobal('fetchRecord');
      failOperation('fetch', recordName);
      if (typeof recordName !== 'string' || recordName.length === 0) {
        throw new CloudKitMockError(
          'fetchRecord requires a non-empty recordName',
          undefined,
          'BAD_REQUEST',
        );
      }
      const existing = state.records[recordName];
      if (!existing) {
        // Port contract: a missing record folds NOT_FOUND into null.
        return null;
      }
      return { ...existing, modified: { timestamp: Date.now() } };
    },

    async saveRecord(record: CloudKitRecordRaw): Promise<CloudKitRecordRaw> {
      recordCall('saveRecord', [record]);
      failGlobal('saveRecord');
      failOperation('save', record.recordName);
      if (typeof record.recordName !== 'string' || record.recordName.length === 0) {
        throw new CloudKitMockError(
          'saveRecord requires a non-empty recordName',
          undefined,
          'BAD_REQUEST',
        );
      }
      if (typeof record.recordType !== 'string' || record.recordType.length === 0) {
        throw new CloudKitMockError(
          'saveRecord requires a non-empty recordType',
          undefined,
          'BAD_REQUEST',
        );
      }
      const existing = state.records[record.recordName];
      if (
        existing &&
        record.recordChangeTag !== undefined &&
        existing.recordChangeTag !== record.recordChangeTag
      ) {
        // Conflict emulation (02-05): stale changeTag → CONFLICT, payload-free.
        throw new CloudKitMockError(
          `saveRecord conflict for ${record.recordName}`,
          409,
          'CONFLICT',
          'Conflict',
        );
      }
      state.counter += 1;
      const saved: CloudKitRecordRaw = {
        ...record,
        recordChangeTag: `tag-${state.counter}`,
        modified: { timestamp: Date.now() },
      };
      state.records[record.recordName] = saved;
      return saved;
    },

    async deleteRecord(recordName: string, recordType: string): Promise<void> {
      recordCall('deleteRecord', [recordName, recordType]);
      failGlobal('deleteRecord');
      failOperation('delete', recordName);
      if (!state.records[recordName]) {
        // The real transport rejects for missing records — idempotency is the caller's policy.
        throw new CloudKitMockError(
          `deleteRecord: ${recordName} not found`,
          404,
          'NOT_FOUND',
          'Record not found',
        );
      }
      delete state.records[recordName];
    },

    async queryRecords(recordType: string): Promise<CloudKitRecordRaw[]> {
      recordCall('queryRecords', [recordType]);
      failGlobal('queryRecords');
      failOperation('query', recordType);
      const all = Object.values(state.records).filter((r) => !r.deleted);
      // Preserved 02-03 behavior: paged answers walked via continuation
      // markers, so a broken continuation walk truncates the listing exactly
      // like the wire would.
      const pageSize = listPageSize !== null && listPageSize > 0 ? listPageSize : all.length;
      const records: CloudKitRecordRaw[] = [];
      let offset = 0;
      let continuationMarker: string | undefined;
      do {
        records.push(...all.slice(offset, offset + pageSize));
        offset += pageSize;
        continuationMarker = offset < all.length ? `continuation-${offset}` : undefined;
      } while (continuationMarker !== undefined);
      return records;
    },
  };
}
