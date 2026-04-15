import type { OneDriveItemRaw } from '../onedrive-mapper.js';

interface MockFile {
  id: string;
  name: string;
  content: string;
  eTag: string;
  cTag: string;
  lastModifiedDateTime: string;
  size: number;
}

let nextId = 1;
let nextETag = 1;

function generateId(): string {
  return `mock-item-${nextId++}`;
}

function generateETag(): string {
  return `"{{etag-${nextETag++}}}"`;
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';

/**
 * Create a mock fetch function that simulates Microsoft Graph API v1.0 endpoints
 * for the OneDrive app folder.
 *
 * Supports:
 * - GET .../content — download file content
 * - GET .../children — list files
 * - GET item metadata (without :/content)
 * - PUT .../content — create or update file content
 * - DELETE item
 * - If-Match header → 412 on mismatch
 */
export function createOneDriveApiMock() {
  const files = new Map<string, MockFile>();

  function reset(): void {
    files.clear();
    nextId = 1;
    nextETag = 1;
  }

  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    const path = url.pathname;
    const method = init?.method ?? 'GET';

    // Auth check
    const authHeader = (init?.headers as Record<string, string>)?.['Authorization'];
    if (!authHeader?.startsWith('Bearer test-token')) {
      return new Response(JSON.stringify({ error: { code: 'InvalidAuthenticationToken' } }), { status: 401 });
    }

    // Strip the GRAPH_BASE prefix to get the relative path
    const basePath = '/v1.0/me/drive/special/approot';
    if (!path.startsWith(basePath)) {
      return new Response(JSON.stringify({ error: { code: 'itemNotFound' } }), { status: 404 });
    }
    const relative = path.slice(basePath.length);

    // GET /children — list files
    if (relative === '/children' && method === 'GET') {
      const value: OneDriveItemRaw[] = Array.from(files.values()).map(f => ({
        id: f.id,
        name: f.name,
        lastModifiedDateTime: f.lastModifiedDateTime,
        eTag: f.eTag,
        cTag: f.cTag,
        size: f.size,
      }));
      return new Response(JSON.stringify({ value }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse path for file operations: /:/{fileName}:/content or /:/{fileName}
    const contentMatch = relative.match(/^:\/([^:]+):\/content$/);
    const itemMatch = relative.match(/^:\/([^:]+)$/);

    // PUT :/{fileName}:/content — create or update file content
    if (contentMatch && method === 'PUT') {
      const fileName = contentMatch[1];
      const body = init?.body as string;
      const ifMatch = (init?.headers as Record<string, string>)?.['If-Match'];

      // Check existing file for If-Match
      const existing = Array.from(files.values()).find(f => f.name === fileName);

      if (ifMatch !== undefined) {
        if (!existing || existing.eTag !== ifMatch) {
          return new Response(JSON.stringify({ error: { code: 'resourceModified' } }), { status: 412 });
        }
      }

      if (existing) {
        // Update existing file
        existing.content = body;
        existing.eTag = generateETag();
        existing.cTag = generateETag();
        existing.lastModifiedDateTime = new Date().toISOString();
        existing.size = body.length;

        return new Response(JSON.stringify({
          id: existing.id,
          name: existing.name,
          lastModifiedDateTime: existing.lastModifiedDateTime,
          eTag: existing.eTag,
          cTag: existing.cTag,
          size: existing.size,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Create new file
      const id = generateId();
      const eTag = generateETag();
      const cTag = generateETag();
      const now = new Date().toISOString();
      const file: MockFile = {
        id,
        name: fileName,
        content: body,
        eTag,
        cTag,
        lastModifiedDateTime: now,
        size: body.length,
      };
      files.set(id, file);

      return new Response(JSON.stringify({
        id: file.id,
        name: file.name,
        lastModifiedDateTime: file.lastModifiedDateTime,
        eTag: file.eTag,
        cTag: file.cTag,
        size: file.size,
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    // GET :/{fileName}:/content — download file content
    if (contentMatch && method === 'GET') {
      const fileName = contentMatch[1];
      const file = Array.from(files.values()).find(f => f.name === fileName);
      if (!file) {
        return new Response(JSON.stringify({ error: { code: 'itemNotFound' } }), { status: 404 });
      }
      return new Response(file.content, { status: 200 });
    }

    // GET :/{fileName} — item metadata
    if (itemMatch && method === 'GET') {
      const fileName = itemMatch[1];
      const file = Array.from(files.values()).find(f => f.name === fileName);
      if (!file) {
        return new Response(JSON.stringify({ error: { code: 'itemNotFound' } }), { status: 404 });
      }
      return new Response(JSON.stringify({
        id: file.id,
        name: file.name,
        lastModifiedDateTime: file.lastModifiedDateTime,
        eTag: file.eTag,
        cTag: file.cTag,
        size: file.size,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // DELETE :/{fileName}
    if (itemMatch && method === 'DELETE') {
      const fileName = itemMatch[1];
      const file = Array.from(files.values()).find(f => f.name === fileName);
      if (!file) {
        return new Response(JSON.stringify({ error: { code: 'itemNotFound' } }), { status: 404 });
      }
      files.delete(file.id);
      return new Response(null, { status: 204 });
    }

    return new Response(JSON.stringify({ error: { code: 'BadRequest' } }), { status: 400 });
  };

  return { mockFetch, reset, files };
}
