import type { DropboxFileRaw } from '../dropbox-mapper.js';

interface MockFile {
  id: string;
  name: string;
  content: string;
  server_modified: string;
  rev: string;
  size: number;
  deleted: boolean;
}

let nextId = 1;
let nextRev = 1;

function generateId(): string {
  return `id:mock-${nextId++}`;
}

function generateRev(): string {
  return `rev-${nextRev++}`;
}

/**
 * Create a mock fetch function that simulates Dropbox API v2 endpoints.
 * Supports: /2/files/download, /2/files/upload, /2/files/delete_v2, /2/files/list_folder.
 */
export function createDropboxApiMock() {
  const files = new Map<string, MockFile>();

  function reset(): void {
    files.clear();
    nextId = 1;
    nextRev = 1;
  }

  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    const hostname = url.hostname;
    const path = url.pathname;
    const method = init?.method ?? 'GET';

    // Auth check
    const headers = init?.headers as Record<string, string> | undefined;
    const authHeader = headers?.['Authorization'];
    if (!authHeader?.startsWith('Bearer test-token')) {
      return new Response(JSON.stringify({ error_summary: 'invalid_access_token', error: {} }), { status: 401 });
    }

    // content.dropboxapi.com/2/files/download
    if (hostname === 'content.dropboxapi.com' && path === '/2/files/download' && method === 'POST') {
      const argHeader = headers?.['Dropbox-API-Arg'];
      if (!argHeader) {
        return new Response(JSON.stringify({ error_summary: 'bad_request', error: {} }), { status: 400 });
      }
      const arg = JSON.parse(argHeader);
      const filePath: string = arg.path;
      const fileName = filePath.replace(/^\//, '');
      const file = Array.from(files.values()).find(f => f.name === fileName && !f.deleted);

      if (!file) {
        return new Response(JSON.stringify({ error_summary: 'path/not_found', error: {} }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const meta: DropboxFileRaw = {
        id: file.id,
        name: file.name,
        '.tag': 'file',
        server_modified: file.server_modified,
        rev: file.rev,
        size: file.size,
      };

      return new Response(file.content, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Dropbox-API-Result': JSON.stringify(meta),
        },
      });
    }

    // content.dropboxapi.com/2/files/upload
    if (hostname === 'content.dropboxapi.com' && path === '/2/files/upload' && method === 'POST') {
      const argHeader = headers?.['Dropbox-API-Arg'];
      if (!argHeader) {
        return new Response(JSON.stringify({ error_summary: 'bad_request', error: {} }), { status: 400 });
      }
      const arg = JSON.parse(argHeader);
      const filePath: string = arg.path;
      const fileName = filePath.replace(/^\//, '');
      const body = (init?.body as string) ?? '';

      const existing = Array.from(files.values()).find(f => f.name === fileName && !f.deleted);

      if (existing) {
        existing.content = body;
        existing.rev = generateRev();
        existing.server_modified = new Date().toISOString();
        existing.size = body.length;
      } else {
        const id = generateId();
        const file: MockFile = {
          id,
          name: fileName,
          content: body,
          server_modified: new Date().toISOString(),
          rev: generateRev(),
          size: body.length,
          deleted: false,
        };
        files.set(id, file);
        // Return the newly created file metadata
        const result: DropboxFileRaw = {
          id: file.id,
          name: file.name,
          '.tag': 'file',
          server_modified: file.server_modified,
          rev: file.rev,
          size: file.size,
        };
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const result: DropboxFileRaw = {
        id: existing.id,
        name: existing.name,
        '.tag': 'file',
        server_modified: existing.server_modified,
        rev: existing.rev,
        size: existing.size,
      };
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // api.dropboxapi.com/2/files/delete_v2
    if (hostname === 'api.dropboxapi.com' && path === '/2/files/delete_v2' && method === 'POST') {
      const body = JSON.parse((init?.body as string) ?? '{}');
      const filePath: string = body.path;
      const fileName = filePath.replace(/^\//, '');
      const file = Array.from(files.values()).find(f => f.name === fileName && !f.deleted);

      if (!file) {
        return new Response(JSON.stringify({ error_summary: 'path/not_found', error: {} }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      file.deleted = true;
      const result: DropboxFileRaw = {
        id: file.id,
        name: file.name,
        '.tag': 'file',
        server_modified: file.server_modified,
        rev: file.rev,
        size: file.size,
      };
      return new Response(JSON.stringify({ metadata: result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // api.dropboxapi.com/2/files/list_folder
    if (hostname === 'api.dropboxapi.com' && path === '/2/files/list_folder' && method === 'POST') {
      const activeFiles = Array.from(files.values()).filter(f => !f.deleted);
      const entries: DropboxFileRaw[] = activeFiles.map(f => ({
        id: f.id,
        name: f.name,
        '.tag': 'file',
        server_modified: f.server_modified,
        rev: f.rev,
        size: f.size,
      }));

      return new Response(JSON.stringify({ entries }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error_summary: 'unknown_endpoint', error: {} }), { status: 400 });
  };

  return { mockFetch, reset, files };
}