import { vi } from 'vitest';

export interface MockCloudKitState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  records: Record<string, any>;
  counter: number;
}

export function createCloudKitApiMock(initialState: MockCloudKitState = { records: {}, counter: 0 }) {
  let state = { ...initialState, records: { ...initialState.records } };

  return {
    reset(newState: MockCloudKitState = { records: {}, counter: 0 }) {
      state = { ...newState, records: { ...newState.records } };
    },
    getState() {
      return state;
    },
    fetchFn: vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = url.toString();
      const body = init?.body ? JSON.parse(init.body as string) : null;

      if (urlStr.includes('/records/lookup')) {
        // Handle lookup
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
        const operations = body?.operations || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // Handle query
        const results = Object.values(state.records).map(r => ({
          recordName: r.recordName,
          recordType: 'SettingsDocument',
          fields: r.fields,
          recordChangeTag: r.recordChangeTag,
          modified: { timestamp: new Date().getTime() },
          deleted: false
        }));

        return new Response(JSON.stringify({ records: results }), {
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
