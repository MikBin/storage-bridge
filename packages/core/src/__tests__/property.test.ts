import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  FileBackedDocumentProvider,
  type FileEntry,
} from '../providers/file-backed-document-provider.js';
import { ProviderRegistry } from '../registry.js';
import type { ProviderId, ProviderCapability, DocumentStoreProvider } from '../types.js';

class MockFileBackedProvider extends FileBackedDocumentProvider {
  readonly id = 'local' as const;
  async connect() {}
  async disconnect() {}
  async isConnected() {
    return true;
  }
  async getProfile() {
    return null;
  }
  async readFile() {
    return null;
  }
  async writeFile(fileName: string): Promise<FileEntry> {
    return {
      id: 'mock-id',
      logicalKey: this.fileNameToKey(fileName),
      name: fileName,
    };
  }
  async removeFile() {}
  async listFiles() {
    return [];
  }
  // Public wrappers over protected mapping helpers so the property tests
  // exercise the real implementation without type-illegal member access.
  exposedKeyToFileName(key: string): string {
    return this.keyToFileName(key);
  }
  exposedFileNameToKey(fileName: string): string {
    return this.fileNameToKey(fileName);
  }
}

const provider = new MockFileBackedProvider();

describe('FileBackedDocumentProvider Properties', () => {
  it('should roundtrip keyToFileName and fileNameToKey correctly for all valid strings', () => {
    fc.assert(
      fc.property(
        // Filter out strings that contain malformed UTF-16 surrogates (lone surrogates)
        // because encodeURIComponent native function naturally throws on them.
        fc.string().filter((s) => {
          try {
            encodeURIComponent(s);
            return true;
          } catch {
            return false;
          }
        }),
        (key) => {
          const fileName = provider.exposedKeyToFileName(key);
          const roundtripKey = provider.exposedFileNameToKey(fileName);
          expect(roundtripKey).toBe(key);
        },
      ),
    );
  });

  it('should always generate a filename ending with .json', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          try {
            encodeURIComponent(s);
            return true;
          } catch {
            return false;
          }
        }),
        (key) => {
          const fileName = provider.exposedKeyToFileName(key);
          expect(fileName.endsWith('.json')).toBe(true);
        },
      ),
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
          }),
        ),
        (rawDescriptors) => {
          const descriptors = rawDescriptors.map((raw) => ({
            id: raw.id as ProviderId,
            label: raw.label,
            capabilities: raw.capabilities as ProviderCapability[],
            isSupported: async () => true,
            create: () => ({}) as unknown as DocumentStoreProvider,
          }));

          // Drive the registry through its own API (register), not the Map
          // base — the oracle asserts last-registration-wins semantics, not
          // that JavaScript Maps work.
          const registry = new ProviderRegistry();
          const lastById = new Map<ProviderId, (typeof descriptors)[0]>();
          for (const d of descriptors) {
            registry.register(d);
            lastById.set(d.id, d);
          }

          for (const [id, d] of lastById.entries()) {
            expect(registry.get(id)).toBe(d);
          }
          expect(registry.size).toBe(lastById.size);
        },
      ),
    );
  });
});
