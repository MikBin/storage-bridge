import { describeProviderContract, type ContractFamily } from '@storage-bridge/testing';
import { LocalDocumentStoreProvider } from '../../providers/local-document-store-provider.js';

/**
 * Honest harness: the unmodified LocalDocumentStoreProvider runs the shared
 * contract suite in-process — the in-memory store needs no API mock.
 *
 * Pagination and 5xx fault injection require API-mock emulation hooks that an
 * in-memory store cannot model, so those scenarios register as `it.todo`
 * scaffolds (the same participation shape as the 01-01 fake provider).
 *
 * Family participation (per FAMILY_OWNERS in @storage-bridge/testing):
 * - 'disconnected-operations' is ACTIVE as of 02-04 (this step owns the
 *   family): every data operation rejects with NotConnectedError before
 *   connect(), and disconnect() preserves the store for reconnect.
 * - 'conflict-force' runs actively: the provider honors the 02-02 D2
 *   semantics (force skips the revision precondition).
 * - 'error-taxonomy' runs actively: local rejections are NotConnectedError /
 *   ConflictError, both SettingsStoreError carrying a code.
 * - 'conflict-payload' stays an expected-fail scaffold owned by 02-05.
 */
const PENDING_FAMILIES: readonly ContractFamily[] = [
  'conflict-payload', // 02-05: ConflictError does not yet carry the logical-key payload
];

describeProviderContract('LocalDocumentStoreProvider', () => new LocalDocumentStoreProvider(), {
  pendingFamilies: PENDING_FAMILIES,
});
