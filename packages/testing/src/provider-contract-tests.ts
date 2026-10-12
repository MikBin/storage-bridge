import { describe, it, expect } from 'vitest';
import type { DocumentStoreProvider } from '@storage-bridge/core';
import { ConflictError, NotConnectedError, SettingsStoreError } from '@storage-bridge/core';
import type { ProviderFactory } from './types.js';

/**
 * Scenario families of the shared provider contract suite.
 *
 * Each family encodes one post-remediation contract clause. A family a provider
 * does not satisfy YET is listed in that provider's `pendingFamilies`; its
 * scenarios are then registered as `it.fails` scaffolds (expected failures), so
 * the suite stays green overall while declaring the pending target behavior.
 * The remediation step that owns the family activates it by removing it from
 * the provider's pending list — that activation is the step's acceptance gate.
 */
export type ContractFamily =
  | 'honest-lifecycle'
  | 'special-char-keys'
  | 'conflict-missing-key'
  | 'conflict-payload'
  | 'disconnected-operations'
  | 'error-taxonomy'
  | 'pagination'
  | 'server-errors';

/** Remediation step that owns activating each scenario family. */
export const FAMILY_OWNERS: Readonly<Record<ContractFamily, string>> = {
  'honest-lifecycle': '02-08',
  'special-char-keys': '02-01',
  'conflict-missing-key': '02-02',
  'conflict-payload': '02-05',
  'disconnected-operations': '02-04',
  'error-taxonomy': '02-06',
  'pagination': '02-03',
  'server-errors': '02-03',
};

/**
 * Families a fresh provider implementation is expected to violate until the
 * owning remediation step lands. Used when a caller provides no explicit
 * `pendingFamilies`. Replaced (not merged) by an explicit list.
 */
export const DEFAULT_PENDING_FAMILIES: readonly ContractFamily[] = [
  'disconnected-operations',
  'conflict-payload',
  'error-taxonomy',
  'pagination',
  'server-errors',
];

/**
 * Families that cannot execute against current harnesses because they require
 * API-mock fault injection (paginated list responses, 5xx responses). They are
 * always declared as `it.todo` until 02-03 lands the mock support and rewrites
 * them as executable scenarios. Never list them in `pendingFamilies`.
 */
const SCAFFOLD_ONLY_FAMILIES: ReadonlySet<ContractFamily> = new Set<ContractFamily>([
  'pagination',
  'server-errors',
]);

export interface ContractSuiteOptions {
  /**
   * Scenario families this provider does not satisfy yet. Replaces
   * DEFAULT_PENDING_FAMILIES when provided. List a family only while the
   * provider actually violates it: an `it.fails` scaffold whose scenario
   * passes fails the suite, which is the signal to activate the family.
   */
  pendingFamilies?: readonly ContractFamily[];
  /**
   * Individual pending scenarios, identified by stable scenario id, for
   * providers that satisfy a family except for specific scenarios. Same
   * activation contract as `pendingFamilies`.
   */
  pendingScenarios?: readonly string[];
}

/** Payload surface 02-05 must give ConflictError: the logical (unencoded) key. */
interface ConflictPayloadCarrier {
  key?: string;
}

interface SpecialCharKey {
  readonly label: string;
  readonly key: string;
  readonly scenarioId: string;
}

const SPECIAL_CHAR_KEYS: ReadonlyArray<SpecialCharKey> = [
  { label: 'an apostrophe', key: "settings-user's-doc", scenarioId: 'special-char-keys:apostrophe' },
  { label: 'a space', key: 'settings doc with spaces', scenarioId: 'special-char-keys:space' },
  { label: 'a slash', key: 'settings/deep/nested', scenarioId: 'special-char-keys:slash' },
  { label: 'a colon', key: 'settings:section:key', scenarioId: 'special-char-keys:colon' },
  { label: 'unicode characters', key: 'réglages-中文-настройки', scenarioId: 'special-char-keys:unicode' },
  { label: 'an emoji', key: 'settings-🚀-doc', scenarioId: 'special-char-keys:emoji' },
];

interface ScenarioDeclaration {
  readonly family: ContractFamily;
  readonly name: string;
  readonly body?: () => Promise<void>;
  readonly scenarioId?: string;
}

function declareScenario(
  pending: ReadonlySet<ContractFamily>,
  pendingScenarios: ReadonlySet<string>,
  declaration: ScenarioDeclaration,
): void {
  const { family, name, body, scenarioId } = declaration;

  if (SCAFFOLD_ONLY_FAMILIES.has(family)) {
    it.todo(`${name} [pending ${FAMILY_OWNERS[family]}]`);
    return;
  }

  const isPending = pending.has(family) || (scenarioId !== undefined && pendingScenarios.has(scenarioId));
  if (isPending) {
    it.fails(`${name} [pending ${FAMILY_OWNERS[family]}]`, body!);
    return;
  }
  it(name, body!);
}

async function connectedProvider(factory: ProviderFactory): Promise<DocumentStoreProvider> {
  const provider = factory();
  await provider.connect();
  return provider;
}

async function captureRejection(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the operation to reject, but it resolved');
}

/**
 * Run the standard conformance test suite against a DocumentStoreProvider.
 *
 * @param name - Provider name for test output (e.g., "FakeDocumentStoreProvider")
 * @param factory - Factory that creates a fresh provider instance per test group
 * @param options - Declares which scenario families the provider still violates
 */
export function describeProviderContract(
  name: string,
  factory: ProviderFactory,
  options?: ContractSuiteOptions,
): void {
  const pending = new Set<ContractFamily>(options?.pendingFamilies ?? DEFAULT_PENDING_FAMILIES);
  const pendingScenarios = new Set<string>(options?.pendingScenarios ?? []);

  describe(`${name} — Provider Contract`, () => {
    describe('Connect/Disconnect Lifecycle', () => {
      declareScenario(pending, pendingScenarios, {
        family: 'honest-lifecycle',
        name: 'starts disconnected',
        body: async () => {
          const provider = factory();
          expect(await provider.isConnected()).toBe(false);
        },
      });

      it('connect() transitions to connected', async () => {
        const provider = factory();
        await provider.connect();
        expect(await provider.isConnected()).toBe(true);
      });

      declareScenario(pending, pendingScenarios, {
        family: 'honest-lifecycle',
        name: 'disconnect() transitions back to disconnected',
        body: async () => {
          const provider = factory();
          await provider.connect();
          await provider.disconnect();
          expect(await provider.isConnected()).toBe(false);
        },
      });

      it('disconnect() when already disconnected does not throw', async () => {
        const provider = factory();
        await expect(provider.disconnect()).resolves.toBeUndefined();
      });

      declareScenario(pending, pendingScenarios, {
        family: 'honest-lifecycle',
        name: 'getProfile() returns null when disconnected',
        body: async () => {
          const provider = factory();
          expect(await provider.getProfile()).toBeNull();
        },
      });

      it('getProfile() returns profile when connected', async () => {
        const provider = factory();
        await provider.connect();
        const profile = await provider.getProfile();
        expect(profile).not.toBeNull();
        expect(profile!.provider).toBeDefined();
      });
    });

    describe('Disconnected Operation Policy', () => {
      declareScenario(pending, pendingScenarios, {
        family: 'disconnected-operations',
        name: 'getDocument() rejects with NotConnectedError before connect()',
        body: async () => {
          const provider = factory();
          await expect(provider.getDocument('any-key')).rejects.toThrow(NotConnectedError);
        },
      });

      declareScenario(pending, pendingScenarios, {
        family: 'disconnected-operations',
        name: 'putDocument() rejects with NotConnectedError before connect()',
        body: async () => {
          const provider = factory();
          await expect(
            provider.putDocument({ key: 'any-key', schemaVersion: 1, updatedAt: '', data: {} }),
          ).rejects.toThrow(NotConnectedError);
        },
      });

      declareScenario(pending, pendingScenarios, {
        family: 'disconnected-operations',
        name: 'deleteDocument() rejects with NotConnectedError before connect()',
        body: async () => {
          const provider = factory();
          await expect(provider.deleteDocument('any-key')).rejects.toThrow(NotConnectedError);
        },
      });

      declareScenario(pending, pendingScenarios, {
        family: 'disconnected-operations',
        name: 'listDocuments() rejects with NotConnectedError before connect()',
        body: async () => {
          const provider = factory();
          await expect(provider.listDocuments()).rejects.toThrow(NotConnectedError);
        },
      });
    });

    describe('Put/Get Round-trip', () => {
      it('getDocument() returns null for non-existent key', async () => {
        const provider = await connectedProvider(factory);
        const result = await provider.getDocument<{ x: number }>('nonexistent');
        expect(result).toBeNull();
      });

      it('putDocument() then getDocument() returns the same data', async () => {
        const provider = await connectedProvider(factory);
        await provider.putDocument<{ x: number }>({
          key: 'round-trip',
          schemaVersion: 1,
          updatedAt: '',
          data: { x: 42 },
        });
        const retrieved = await provider.getDocument<{ x: number }>('round-trip');
        expect(retrieved).not.toBeNull();
        expect(retrieved!.data).toEqual({ x: 42 });
      });

      it('putDocument() returns an envelope with the provided key and data', async () => {
        const provider = await connectedProvider(factory);
        const doc = await provider.putDocument<{ val: string }>({
          key: 'my-key',
          schemaVersion: 1,
          updatedAt: '',
          data: { val: 'hello' },
        });
        expect(doc.key).toBe('my-key');
        expect(doc.data).toEqual({ val: 'hello' });
      });

      it('multiple keys can coexist independently', async () => {
        const provider = await connectedProvider(factory);
        await provider.putDocument({ key: 'key-a', schemaVersion: 1, updatedAt: '', data: { a: 1 } });
        await provider.putDocument({ key: 'key-b', schemaVersion: 1, updatedAt: '', data: { b: 2 } });
        const a = await provider.getDocument<{ a: number }>('key-a');
        const b = await provider.getDocument<{ b: number }>('key-b');
        expect(a!.data).toEqual({ a: 1 });
        expect(b!.data).toEqual({ b: 2 });
      });

      it('overwriting an existing key updates its data', async () => {
        const provider = await connectedProvider(factory);
        await provider.putDocument<{ v: number }>({ key: 'overwrite', schemaVersion: 1, updatedAt: '', data: { v: 1 } });
        await provider.putDocument<{ v: number }>({ key: 'overwrite', schemaVersion: 1, updatedAt: '', data: { v: 2 } });
        const retrieved = await provider.getDocument<{ v: number }>('overwrite');
        expect(retrieved!.data).toEqual({ v: 2 });
      });
    });

    describe('Special-Character Keys', () => {
      // bypass: fast-check not installed; deterministic case matrix (explicit key corpus).
      for (const { label, key, scenarioId } of SPECIAL_CHAR_KEYS) {
        declareScenario(pending, pendingScenarios, {
          family: 'special-char-keys',
          scenarioId,
          name: `putDocument()/getDocument() round-trip a key containing ${label}`,
          body: async () => {
            const provider = await connectedProvider(factory);
            const data = { marker: label };
            const stored = await provider.putDocument({ key, schemaVersion: 1, updatedAt: '', data });
            expect(stored.key).toBe(key);

            const retrieved = await provider.getDocument<{ marker: string }>(key);
            expect(retrieved).not.toBeNull();
            expect(retrieved!.key).toBe(key);
            expect(retrieved!.data).toEqual(data);
          },
        });
      }

      declareScenario(pending, pendingScenarios, {
        family: 'special-char-keys',
        name: 'listDocuments() reports the logical key for every special-character document',
        body: async () => {
          const provider = await connectedProvider(factory);
          for (const { key } of SPECIAL_CHAR_KEYS) {
            await provider.putDocument({ key, schemaVersion: 1, updatedAt: '', data: {} });
          }

          const keys = (await provider.listDocuments()).map(summary => summary.key).sort();
          expect(keys).toEqual(SPECIAL_CHAR_KEYS.map(entry => entry.key).sort());
        },
      });
    });

    describe('List Documents', () => {
      it('listDocuments() returns empty array when no documents exist', async () => {
        const provider = await connectedProvider(factory);
        expect(await provider.listDocuments()).toEqual([]);
      });

      it('listDocuments() returns summaries for all stored documents', async () => {
        const provider = await connectedProvider(factory);
        await provider.putDocument({ key: 'list-a', schemaVersion: 1, updatedAt: '', data: {} });
        await provider.putDocument({ key: 'list-b', schemaVersion: 1, updatedAt: '', data: {} });
        const list = await provider.listDocuments();
        expect(list).toHaveLength(2);
        const keys = list.map(s => s.key).sort();
        expect(keys).toEqual(['list-a', 'list-b']);
      });

      it('listDocuments() reflects documents added via putDocument()', async () => {
        const provider = await connectedProvider(factory);
        expect(await provider.listDocuments()).toEqual([]);
        await provider.putDocument({ key: 'added', schemaVersion: 1, updatedAt: '', data: {} });
        const list = await provider.listDocuments();
        expect(list).toHaveLength(1);
        expect(list[0].key).toBe('added');
      });

      it('listDocuments() reflects documents removed via deleteDocument()', async () => {
        const provider = await connectedProvider(factory);
        await provider.putDocument({ key: 'to-remove', schemaVersion: 1, updatedAt: '', data: {} });
        await provider.deleteDocument('to-remove');
        const list = await provider.listDocuments();
        expect(list).toEqual([]);
      });
    });

    describe('Delete', () => {
      it('deleteDocument() removes a document so subsequent getDocument() returns null', async () => {
        const provider = await connectedProvider(factory);
        await provider.putDocument({ key: 'del', schemaVersion: 1, updatedAt: '', data: {} });
        await provider.deleteDocument('del');
        expect(await provider.getDocument('del')).toBeNull();
      });

      it('deleteDocument() does not throw for non-existent keys', async () => {
        const provider = await connectedProvider(factory);
        await expect(provider.deleteDocument('never-existed')).resolves.toBeUndefined();
      });

      it('deleting one document does not affect others', async () => {
        const provider = await connectedProvider(factory);
        await provider.putDocument({ key: 'keep', schemaVersion: 1, updatedAt: '', data: { keep: true } });
        await provider.putDocument({ key: 'remove', schemaVersion: 1, updatedAt: '', data: { remove: true } });
        await provider.deleteDocument('remove');
        expect(await provider.getDocument('keep')).not.toBeNull();
        expect(await provider.getDocument('remove')).toBeNull();
      });
    });

    describe('Revision Updates', () => {
      it('first putDocument() produces an envelope with a revision', async () => {
        const provider = await connectedProvider(factory);
        const doc = await provider.putDocument({ key: 'rev', schemaVersion: 1, updatedAt: '', data: {} });
        expect(doc.revision).toBeDefined();
        expect(typeof doc.revision).toBe('string');
      });

      it('subsequent putDocument() for the same key produces a different revision', async () => {
        const provider = await connectedProvider(factory);
        const first = await provider.putDocument({ key: 'rev-change', schemaVersion: 1, updatedAt: '', data: {} });
        const second = await provider.putDocument({ key: 'rev-change', schemaVersion: 1, updatedAt: '', data: {} });
        expect(first.revision).not.toBe(second.revision);
      });

      it('revision is stable — reading the same document twice returns the same revision', async () => {
        const provider = await connectedProvider(factory);
        await provider.putDocument({ key: 'stable-rev', schemaVersion: 1, updatedAt: '', data: {} });
        const r1 = await provider.getDocument('stable-rev');
        const r2 = await provider.getDocument('stable-rev');
        expect(r1!.revision).toBe(r2!.revision);
      });

      it('revision is reflected in listDocuments() summaries', async () => {
        const provider = await connectedProvider(factory);
        const doc = await provider.putDocument({ key: 'list-rev', schemaVersion: 1, updatedAt: '', data: {} });
        const list = await provider.listDocuments();
        const found = list.find(s => s.key === 'list-rev');
        expect(found).toBeDefined();
        expect(found!.revision).toBe(doc.revision);
      });
    });

    describe('Conflict/Optimistic Concurrency (expectedRevision)', () => {
      it('putDocument() with a matching expectedRevision succeeds', async () => {
        const provider = await connectedProvider(factory);
        const doc = await provider.putDocument({ key: 'conflict', schemaVersion: 1, updatedAt: '', data: {} });
        const updated = await provider.putDocument(
          { key: 'conflict', schemaVersion: 1, updatedAt: '', data: { v: 2 } },
          { expectedRevision: doc.revision },
        );
        expect(updated.data).toEqual({ v: 2 });
      });

      it('putDocument() with a stale expectedRevision throws ConflictError', async () => {
        const provider = await connectedProvider(factory);
        await provider.putDocument({ key: 'stale', schemaVersion: 1, updatedAt: '', data: {} });
        await expect(
          provider.putDocument(
            { key: 'stale', schemaVersion: 1, updatedAt: '', data: {} },
            { expectedRevision: 'stale-revision-that-does-not-match' },
          ),
        ).rejects.toThrow(ConflictError);
      });

      it('putDocument() without expectedRevision always succeeds', async () => {
        const provider = await connectedProvider(factory);
        await provider.putDocument({ key: 'free', schemaVersion: 1, updatedAt: '', data: {} });
        const updated = await provider.putDocument(
          { key: 'free', schemaVersion: 1, updatedAt: '', data: { v: 2 } },
        );
        expect(updated.data).toEqual({ v: 2 });
      });
    });

    describe('Conflict on Missing Key (expectedRevision)', () => {
      declareScenario(pending, pendingScenarios, {
        family: 'conflict-missing-key',
        name: 'putDocument() with expectedRevision against a non-existent key rejects with ConflictError',
        body: async () => {
          const provider = await connectedProvider(factory);
          await expect(
            provider.putDocument(
              { key: 'missing-key-conflict', schemaVersion: 1, updatedAt: '', data: { v: 1 } },
              { expectedRevision: 'revision-of-a-never-written-key' },
            ),
          ).rejects.toThrow(ConflictError);
        },
      });
    });

    describe('ConflictError Payload', () => {
      declareScenario(pending, pendingScenarios, {
        family: 'conflict-payload',
        name: 'ConflictError exposes the logical key, not the storage-encoded filename',
        body: async () => {
          const provider = await connectedProvider(factory);
          const key = 'conflict/payload-key';
          await provider.putDocument({ key, schemaVersion: 1, updatedAt: '', data: { v: 1 } });

          const error = await captureRejection(
            provider.putDocument(
              { key, schemaVersion: 1, updatedAt: '', data: { v: 2 } },
              { expectedRevision: 'stale-revision' },
            ),
          );
          expect(error).toBeInstanceOf(ConflictError);

          const payload = error as ConflictPayloadCarrier;
          expect(payload.key).toBe(key);
        },
      });
    });

    describe('Error Taxonomy', () => {
      declareScenario(pending, pendingScenarios, {
        family: 'error-taxonomy',
        name: 'every observed rejection is a SettingsStoreError carrying a code',
        body: async () => {
          const provider = await connectedProvider(factory);
          await provider.putDocument({ key: 'taxonomy', schemaVersion: 1, updatedAt: '', data: { v: 1 } });

          const staleConflict = await captureRejection(
            provider.putDocument(
              { key: 'taxonomy', schemaVersion: 1, updatedAt: '', data: { v: 2 } },
              { expectedRevision: 'stale-revision' },
            ),
          );
          expect(staleConflict).toBeInstanceOf(SettingsStoreError);
          expect((staleConflict as SettingsStoreError).code).toBeTruthy();

          const coldProvider = factory();
          const preConnect = await captureRejection(coldProvider.getDocument('taxonomy'));
          expect(preConnect).toBeInstanceOf(SettingsStoreError);
          expect((preConnect as SettingsStoreError).code).toBeTruthy();
        },
      });
    });

    describe('Pagination', () => {
      // bypass: fast-check not installed; deterministic intent scaffolds.
      // Activation requires API mocks that emulate paginated list responses (02-03).
      declareScenario(pending, pendingScenarios, {
        family: 'pagination',
        name: 'listDocuments() aggregates every page across pagination boundaries',
      });
      declareScenario(pending, pendingScenarios, {
        family: 'pagination',
        name: 'listDocuments() follows continuation tokens until the collection is exhausted',
      });
    });

    describe('Server Errors (5xx)', () => {
      // bypass: fast-check not installed; deterministic intent scaffolds.
      // Activation requires API mocks that emulate 5xx responses (02-03).
      declareScenario(pending, pendingScenarios, {
        family: 'server-errors',
        name: 'getDocument() on a 5xx response surfaces a SettingsStoreError, never silent null',
      });
      declareScenario(pending, pendingScenarios, {
        family: 'server-errors',
        name: 'putDocument() on a 5xx response surfaces a SettingsStoreError',
      });
      declareScenario(pending, pendingScenarios, {
        family: 'server-errors',
        name: 'listDocuments() on a 5xx response surfaces a SettingsStoreError',
      });
    });
  });
}
