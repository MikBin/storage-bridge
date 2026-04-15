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

export function createDriveApiMock() {
  const files = new Map<string, MockFile>();

  function reset(): void {
    files.clear();
    nextId = 1;
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
      let results = Array.from(files.values()).filter(f => !f.trashed);

      const nameMatch = q.match(/name='([^']+)'/);
      if (nameMatch) {
        results = results.filter(f => f.name === nameMatch[1]);
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

  return { mockFetch, reset, files };
}
