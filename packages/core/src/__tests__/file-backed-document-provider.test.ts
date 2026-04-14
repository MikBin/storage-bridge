import { describe, it, expect } from 'vitest';
import type { FileEntry } from '../providers/file-backed-document-provider.js';
import { FileBackedDocumentProvider } from '../providers/file-backed-document-provider.js';
import type { ProviderId, PutOptions, SettingsEnvelope, SettingsSummary, ConnectedProfile } from '../types.js';

class InMemoryFileProvider extends FileBackedDocumentProvider {
  readonly id: ProviderId = 'local';
  private store = new Map<string, { text: string; meta: FileEntry }>();
  private revCounter = 0;

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async isConnected(): Promise<boolean> { return true; }
  async getProfile(): Promise<ConnectedProfile | null> { return { provider: this.id }; }

  protected async readFile(fileName: string): Promise<{ text: string; meta: FileEntry } | null> {
    const entry = this.store.get(fileName);
    return entry ?? null;
  }

  protected async writeFile(fileName: string, text: string, _options?: PutOptions): Promise<FileEntry> {
    const existing = this.store.get(fileName);
    this.revCounter++;
    const meta: FileEntry = {
      id: `${fileName}-${this.revCounter}`,
      logicalKey: this.fileNameToKey(fileName),
      name: fileName,
      updatedAt: new Date().toISOString(),
      revision: `rev-${this.revCounter}`,
      size: text.length,
    };
    this.store.set(fileName, { text, meta });
    return meta;
  }

  protected async removeFile(fileName: string): Promise<void> {
    this.store.delete(fileName);
  }

  protected async listFiles(): Promise<FileEntry[]> {
    return Array.from(this.store.values()).map(e => e.meta);
  }
}

function createProvider(): InMemoryFileProvider {
  return new InMemoryFileProvider();
}

describe('FileBackedDocumentProvider', () => {
  describe('keyToFileName / fileNameToKey', () => {
    it('encodes key with .json suffix', () => {
      const p = createProvider();
      expect(p['keyToFileName']('settings')).toBe('settings.json');
    });

    it('handles special characters', () => {
      const p = createProvider();
      expect(p['keyToFileName']('user/preferências')).toBe('user%2Fprefer%C3%AAncias.json');
    });

    it('reverses keyToFileName', () => {
      const p = createProvider();
      const key = 'user/settings';
      expect(p['fileNameToKey'](p['keyToFileName'](key))).toBe(key);
    });
  });

  describe('getDocument', () => {
    it('returns null for missing key', async () => {
      const p = createProvider();
      const result = await p.getDocument<{ x: number }>('missing');
      expect(result).toBeNull();
    });
  });

  describe('putDocument + getDocument', () => {
    it('creates and retrieves a document', async () => {
      const p = createProvider();
      const doc = await p.putDocument<{ x: number }>(
        { key: 'test', schemaVersion: 1, updatedAt: '', data: { x: 42 } },
      );
      expect(doc.key).toBe('test');
      expect(doc.data).toEqual({ x: 42 });
      expect(doc.revision).toBeDefined();

      const retrieved = await p.getDocument<{ x: number }>('test');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.data).toEqual({ x: 42 });
    });

    it('updates an existing document', async () => {
      const p = createProvider();
      await p.putDocument<{ v: number }>({ key: 'cfg', schemaVersion: 1, updatedAt: '', data: { v: 1 } });
      const updated = await p.putDocument<{ v: number }>({ key: 'cfg', schemaVersion: 1, updatedAt: '', data: { v: 2 } });
      expect(updated.data).toEqual({ v: 2 });

      const retrieved = await p.getDocument<{ v: number }>('cfg');
      expect(retrieved!.data).toEqual({ v: 2 });
    });

    it('propagates revision from file metadata', async () => {
      const p = createProvider();
      const doc = await p.putDocument<{ x: number }>({ key: 'rev-test', schemaVersion: 1, updatedAt: '', data: { x: 1 } });
      expect(doc.revision).toBe('rev-1');
    });
  });

  describe('deleteDocument', () => {
    it('removes a document', async () => {
      const p = createProvider();
      await p.putDocument<{ x: number }>({ key: 'del-me', schemaVersion: 1, updatedAt: '', data: { x: 1 } });
      await p.deleteDocument('del-me');
      const result = await p.getDocument<{ x: number }>('del-me');
      expect(result).toBeNull();
    });

    it('is a no-op for missing key', async () => {
      const p = createProvider();
      await expect(p.deleteDocument('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('listDocuments', () => {
    it('returns empty array when nothing stored', async () => {
      const p = createProvider();
      const list = await p.listDocuments();
      expect(list).toEqual([]);
    });

    it('returns all stored documents as summaries', async () => {
      const p = createProvider();
      await p.putDocument<{ a: number }>({ key: 'a', schemaVersion: 1, updatedAt: '', data: { a: 1 } });
      await p.putDocument<{ b: number }>({ key: 'b', schemaVersion: 1, updatedAt: '', data: { b: 2 } });
      const list = await p.listDocuments();
      expect(list).toHaveLength(2);
      const keys = list.map(s => s.key).sort();
      expect(keys).toEqual(['a', 'b']);
      for (const s of list) {
        expect(s.updatedAt).toBeDefined();
      }
    });
  });
});