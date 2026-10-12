import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { FileBackedDocumentProvider, type FileEntry } from '../providers/file-backed-document-provider.js';
import { ProviderRegistry } from '../registry.js';
import type { ProviderId, ProviderCapability, DocumentStoreProvider } from '../types.js';

class MockFileBackedProvider extends FileBackedDocumentProvider {
  readonly id = 'local' as const;
  async connect() {}
  async disconnect() {}
  async isConnected() { return true; }
  async getProfile() { return null; }
  async readFile() { return null; }
  async writeFile(fileName: string): Promise<FileEntry> {
    return {
      id: 'mock-id',
      logicalKey: this.fileNameToKey(fileName),
      name: fileName,
    };
  }
  async removeFile() {}
  async listFiles() { return []; }
}

const provider = new MockFileBackedProvider();

describe('FileBackedDocumentProvider Properties', () => {
  it('should roundtrip keyToFileName and fileNameToKey correctly for all valid strings', () => {
    fc.assert(
      fc.property(
        // Filter out strings that contain malformed UTF-16 surrogates (lone surrogates)
        // because encodeURIComponent native function naturally throws on them.
        fc.string().filter(s => {
          try {
            encodeURIComponent(s);
            return true;
          } catch {
            return false;
          }
        }),
        (key) => {
          const fileName = provider.keyToFileName(key);
          const roundtripKey = provider.fileNameToKey(fileName);
          expect(roundtripKey).toBe(key);
        }
      )
    );
  });

  it('should always generate a filename ending with .json', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => {
          try {
            encodeURIComponent(s);
            return true;
          } catch {
            return false;
          }
        }),
        (key) => {
          const fileName = provider.keyToFileName(key);
          expect(fileName.endsWith('.json')).toBe(true);
        }
      )
    );
  });
});

describe('ProviderRegistry Properties', () => {
  it('should allow registering and looking up arbitrary providers', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.constantFrom('local', 'google-drive', 'onedrive', 'dropbox', 'icloud'),
            label: fc.string(),
            capabilities: fc.array(fc.constantFrom('web', 'react-native', 'ios', 'android')),
          })
        ),
        (rawDescriptors) => {
          const descriptors = rawDescriptors.map(raw => ({
            id: raw.id as ProviderId,
            label: raw.label,
            capabilities: raw.capabilities as ProviderCapability[],
            isSupported: async () => true,
            create: () => ({} as unknown as DocumentStoreProvider)
          }));
          
          const registry = new ProviderRegistry(descriptors);
          const expected = new Map<ProviderId, typeof descriptors[0]>();
          for (const d of descriptors) {
            expected.set(d.id, d);
          }
          
          for (const [id, d] of expected.entries()) {
            expect(registry.get(id)).toBe(d);
          }
        }
      )
    );
  });
});
