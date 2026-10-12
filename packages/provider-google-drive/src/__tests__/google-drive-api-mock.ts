import type { GoogleDriveFileRaw } from '../google-drive-mapper.js';

interface MockFile {
  id: string;
  name: string;
  content: string;
  mimeType: string;
  modifiedTime: string;
  version: number;
  trashed: boolean;
}

let nextId = 1;

function generateId(): string {
  return `mock-file-${nextId++}`;
}

/**
 * Emulates the Drive v3 q grammar for a `name='…'` string literal: the literal
 * is single-quoted and a backslash escapes itself and the quote (`\\`, `\'`).
 * Returns null when the query carries no name clause.
 */
function extractQueryNameLiteral(q: string): string | null {
  const marker = "name='";
  const start = q.indexOf(marker);
  if (start === -1) return null;

  let literal = '';
  for (let i = start + marker.length; i < q.length; i += 1) {
    const char = q[i];
    if (char === '\\' && (q[i + 1] === "'" || q[i + 1] === '\\')) {
      literal += q[i + 1];
      i += 1;
      continue;
    }
    if (char === "'") break;
    literal += char;
  }
  return literal;
}

export function createDriveApiMock() {
  const files = new Map<string, MockFile>();
  let queryFailureStatus: number | null = null;

  function reset(): void {
    files.clear();
    nextId = 1;
    queryFailureStatus = null;
  }

  /** Arms a one-endpoint failure: the next files.list query (q param present) fails with `status` until cleared. */
  function setQueryFailure(status: number | null): void {
    queryFailureStatus = status;
  }

  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    const path = url.pathname;
    const method = init?.method ?? 'GET';

    const authHeader = (init?.headers as Record<string, string>)?.['Authorization'];
    if (!authHeader?.startsWith('Bearer test-token')) {
      return new Response(JSON.stringify({ error: { code: 401 } }), { status: 401 });
    }

    if (path.endsWith('/files') && !path.includes('upload') && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';

      if (q !== '' && queryFailureStatus !== null) {
        return new Response(JSON.stringify({ error: { code: queryFailureStatus } }), {
          status: queryFailureStatus,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      let results = Array.from(files.values()).filter(f => !f.trashed);

      const nameLiteral = extractQueryNameLiteral(q);
      if (nameLiteral !== null) {
        results = results.filter(f => f.name === nameLiteral);
      }

      const responseFiles: GoogleDriveFileRaw[] = results.map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: String(f.content.length),
        modifiedTime: f.modifiedTime,
        version: String(f.version),
      }));

      return new Response(JSON.stringify({ files: responseFiles }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path.endsWith('/files') && path.includes('upload') && method === 'POST') {
      const body = init?.body as string;
      const boundaryMatch = body.match(/--([^\r\n]+)/);
      const boundary = boundaryMatch ? boundaryMatch[1] : '';

      const parts = body.split(`--${boundary}`);
      let metadata: Record<string, unknown> = {};
      let content = '';

      for (const part of parts) {
        if (part.includes('application/json; charset=UTF-8') && !part.includes('"data"')) {
          const jsonStr = part.split('\r\n\r\n')[1]?.replace(/\r\n--.*/, '').trim();
          if (jsonStr) metadata = JSON.parse(jsonStr);
        } else if (part.includes('application/json') && part.includes('"data"')) {
          content = part.split('\r\n\r\n')[1]?.replace(/\r\n--.*/, '').trim() ?? '';
        }
      }

      const id = generateId();
      const file: MockFile = {
        id,
        name: metadata.name as string,
        content,
        mimeType: 'application/json',
        modifiedTime: new Date().toISOString(),
        version: 1,
        trashed: false,
      };
      files.set(id, file);

      return new Response(JSON.stringify({
        id: file.id,
        name: file.name,
        modifiedTime: file.modifiedTime,
        version: String(file.version),
        size: String(file.content.length),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const fileIdMatch = path.match(/\/files\/([^/?]+)/);
    if (!fileIdMatch) {
      return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
    }
    const fileId = fileIdMatch[1];
    const file = files.get(fileId);

    if (method === 'GET' && url.searchParams.get('alt') === 'media') {
      if (!file || file.trashed) {
        return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
      }
      return new Response(file.content, { status: 200 });
    }

    if (method === 'GET') {
      if (!file || file.trashed) {
        return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
      }
      return new Response(JSON.stringify({
        id: file.id,
        name: file.name,
        modifiedTime: file.modifiedTime,
        version: String(file.version),
        size: String(file.content.length),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (method === 'PATCH' || method === 'PUT') {
      if (!file || file.trashed) {
        return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
      }
      file.content = init?.body as string;
      file.version += 1;
      file.modifiedTime = new Date().toISOString();

      return new Response(JSON.stringify({
        id: file.id,
        name: file.name,
        modifiedTime: file.modifiedTime,
        version: String(file.version),
        size: String(file.content.length),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (method === 'DELETE') {
      if (!file) {
        return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
      }
      file.trashed = true;
      return new Response(null, { status: 204 });
    }

    return new Response(JSON.stringify({ error: { code: 400 } }), { status: 400 });
  };

  return { mockFetch, reset, setQueryFailure, files };
}
