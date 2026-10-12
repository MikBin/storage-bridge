import { vi } from 'vitest';

export interface MockCloudKitState {
  records: Record<string, any>;
  counter: number;
}

export function createCloudKitApiMock(initialState: MockCloudKitState = { records: {}, counter: 0 }) {
  let state = { ...initialState, records: { ...initialState.records } };
  let listPageSize: number | null = null;
  let globalFailureStatus: number | null = null;
  // Injected application-level failure: when set, the matching endpoint answers
  // HTTP 200 with a result carrying this serverErrorCode (CloudKit surfaces
  // many errors in-band rather than as HTTP statuses).
  let operationFailure: { endpoint: 'lookup' | 'modify'; serverErrorCode: string; reason: string } | null = null;

  return {
    reset(newState: MockCloudKitState = { records: {}, counter: 0 }) {
      state = { ...newState, records: { ...newState.records } };
      listPageSize = null;
      globalFailureStatus = null;
      operationFailure = null;
    },
    getState() {
      return state;
    },
    /** Emulated server-side page size for /records/query; null serves everything in one page. */
    setListPageSize(pageSize: number | null) {
      listPageSize = pageSize;
    },
    /** Makes every endpoint answer with HTTP `status` until cleared — emulates a server outage. */
    setGlobalFailure(status: number | null) {
      globalFailureStatus = status;
    },
    /**
     * Makes the next-style matching endpoint answer HTTP 200 with an in-band
     * serverErrorCode result — emulates CloudKit application-level errors
     * (anything other than the NOT_FOUND/CONFLICT happy-path handling).
     */
    setOperationFailure(endpoint: 'lookup' | 'modify', serverErrorCode: string, reason: string) {
      operationFailure = { endpoint, serverErrorCode, reason };
    },
    fetchFn: vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = url.toString();
      const body = init?.body ? JSON.parse(init.body as string) : null;

      // Server outage emulation: every endpoint answers with `status`.
      if (globalFailureStatus !== null) {
        return new Response(JSON.stringify({ serverErrorCode: 'SERVICE_UNAVAILABLE', reason: 'server outage' }), {
          status: globalFailureStatus,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/records/lookup')) {
        // Handle lookup
        if (operationFailure?.endpoint === 'lookup') {
          return new Response(
            JSON.stringify({
              records: [{
                recordName: body?.records?.[0]?.recordName ?? 'unknown',
                serverErrorCode: operationFailure.serverErrorCode,
                reason: operationFailure.reason,
              }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        const records = body?.records || [];
        const results = records.map((r: { recordName: string }) => {
          const record = state.records[r.recordName];
          if (record) {
            return {
              recordName: r.recordName,
              recordType: 'SettingsDocument',
              fields: record.fields,
              recordChangeTag: record.recordChangeTag,
              modified: { timestamp: new Date().getTime() },
              deleted: false
            };
          } else {
            return {
              recordName: r.recordName,
              serverErrorCode: 'NOT_FOUND',
              reason: 'Record not found'
            };
          }
        });

        return new Response(JSON.stringify({ records: results }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (urlStr.includes('/records/modify')) {
        // Handle modify (save/delete)
        if (operationFailure?.endpoint === 'modify') {
          return new Response(
            JSON.stringify({
              records: [{
                recordName: body?.operations?.[0]?.record?.recordName ?? 'unknown',
                serverErrorCode: operationFailure.serverErrorCode,
                reason: operationFailure.reason,
              }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        const operations = body?.operations || [];
        const results = operations.map((op: any) => {
          const { operationType, record } = op;
          const { recordName, recordChangeTag } = record;

          if (operationType === 'create' || operationType === 'update' || operationType === 'forceUpdate') {
            const existing = state.records[recordName];

            // Check conflict
            if (operationType === 'update' && existing && existing.recordChangeTag !== recordChangeTag) {
              return {
                recordName,
                serverErrorCode: 'CONFLICT',
                reason: 'Conflict',
                serverRecord: existing
              };
            }

            state.counter++;
            const newTag = `tag-${Date.now()}-${state.counter}`;
            state.records[recordName] = {
              recordName,
              recordType: 'SettingsDocument',
              fields: record.fields,
              recordChangeTag: newTag
            };

            return {
              recordName,
              recordType: 'SettingsDocument',
              fields: record.fields,
              recordChangeTag: newTag,
              modified: { timestamp: new Date().getTime() },
              deleted: false
            };
          }

          if (operationType === 'delete') {
            delete state.records[recordName];
            return {
              recordName,
              deleted: true
            };
          }

          return { serverErrorCode: 'BAD_REQUEST', reason: `Unknown operationType ${operationType}` };
        });

        return new Response(JSON.stringify({ records: results }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (urlStr.includes('/records/query')) {
        // Handle query (paged via continuationMarker, CloudKit query style)
        const all = Object.values(state.records).map(r => ({
          recordName: r.recordName,
          recordType: 'SettingsDocument',
          fields: r.fields,
          recordChangeTag: r.recordChangeTag,
          modified: { timestamp: new Date().getTime() },
          deleted: false
        }));

        const pageSize = listPageSize ?? all.length;
        let offset = 0;
        const marker: unknown = body?.continuationMarker;
        if (marker !== undefined && marker !== null) {
          if (typeof marker !== 'string' || !/^continuation-\d+$/.test(marker)) {
            return new Response(JSON.stringify({ serverErrorCode: 'BAD_REQUEST', reason: 'invalid continuationMarker' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          offset = Number.parseInt(marker.replace(/^continuation-/, ''), 10);
        }

        const page = all.slice(offset, offset + pageSize);
        const resultBody: { records: unknown[]; continuationMarker?: string } = { records: page };
        if (offset + pageSize < all.length) {
          resultBody.continuationMarker = `continuation-${offset + pageSize}`;
        }

        return new Response(JSON.stringify(resultBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ serverErrorCode: 'NOT_FOUND', reason: 'Endpoint not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    })
  };
}
