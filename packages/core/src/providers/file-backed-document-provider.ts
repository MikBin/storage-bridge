import { AuthRequiredError, NotConnectedError, SettingsStoreError } from '../errors.js';
import type {
  DocumentStoreProvider,
  ProviderId,
  PutOptions,
  SettingsEnvelope,
  SettingsSummary,
  ConnectedProfile,
} from '../types.js';

export interface FileEntry {
  id: string;
  logicalKey: string;
  name: string;
  updatedAt?: string;
  revision?: string;
  size?: number;
}

export abstract class FileBackedDocumentProvider implements DocumentStoreProvider {
  abstract readonly id: ProviderId;

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): Promise<boolean>;
  abstract getProfile(): Promise<ConnectedProfile | null>;

  protected abstract readFile(fileName: string): Promise<{ text: string; meta: FileEntry } | null>;
  /**
   * D2 conditional-write contract: implementations MUST treat
   * options.expectedRevision as a write precondition (ConflictError when the
   * stored revision differs or the key is missing) and options.force as the
   * opt-out into a blind last-writer-wins overwrite. A write without any
   * expectation is LWW.
   */
  protected abstract writeFile(
    fileName: string,
    body: string,
    options?: PutOptions,
  ): Promise<FileEntry>;
  protected abstract removeFile(fileName: string): Promise<void>;
  protected abstract listFiles(): Promise<FileEntry[]>;

  protected keyToFileName(key: string): string {
    return `${encodeURIComponent(key)}.json`;
  }

  protected fileNameToKey(fileName: string): string {
    return decodeURIComponent(fileName.replace(/\.json$/, ''));
  }

  /**
   * Exact-name disambiguation for storage backends that return candidate
   * files for a name lookup: only a file whose remote name equals the
   * requested fileName satisfies the lookup, so prefix or fuzzy matches
   * from the backend listing never resolve.
   */
  protected findExactFileNameMatch(files: FileEntry[], fileName: string): FileEntry | null {
    return files.find((file) => file.name === fileName) ?? null;
  }

  /**
   * Uniform pre-connect policy (02-06): every data operation rejects with
   * NotConnectedError before connect(), based on the provider's honest
   * isConnected() answer — never with a raw transport 401 masquerading as an
   * auth failure.
   */
  private async ensureConnected(): Promise<void> {
    if (!(await this.isConnected())) {
      throw new NotConnectedError();
    }
  }

  /**
   * Uniform transport-error classification (02-06): 401/403 reject with
   * AuthRequiredError for this provider; any other non-ok response rejects
   * with a coded SettingsStoreError whose message carries the operation
   * label and the HTTP status. Provider-specific statuses (404 missing,
   * 409/412 conflict) are handled by callers BEFORE this guard.
   */
  protected requireTransportSuccess(res: Response, message: string, code: string): void {
    if (res.status === 401 || res.status === 403) {
      throw new AuthRequiredError(this.id);
    }
    if (!res.ok) {
      throw new SettingsStoreError(`${message}: ${res.status}`, code);
    }
  }

  /**
   * Remote payloads are untrusted input: anything that does not parse to a
   * settings-envelope object rejects with a coded DOCUMENT_CORRUPT
   * SettingsStoreError whose cause chains the underlying parse failure — a
   * raw SyntaxError never escapes the provider boundary (02-06).
   */
  private parseEnvelope<T>(text: string): SettingsEnvelope<T> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new SettingsStoreError(
        'Remote document is not valid JSON',
        'DOCUMENT_CORRUPT',
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      !('data' in parsed)
    ) {
      const observed = parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed;
      throw new SettingsStoreError(
        'Remote document payload is not a settings envelope',
        'DOCUMENT_CORRUPT',
        new Error(`Parsed payload is ${observed} instead of a settings-envelope object`),
      );
    }

    return parsed as SettingsEnvelope<T>;
  }

  async getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    await this.ensureConnected();
    const file = await this.readFile(this.keyToFileName(key));
    if (!file) return null;
    const parsed = this.parseEnvelope<T>(file.text);
    return { ...parsed, key, revision: file.meta.revision ?? parsed.revision };
  }

  async putDocument<T>(
    doc: SettingsEnvelope<T>,
    options?: PutOptions,
  ): Promise<SettingsEnvelope<T>> {
    await this.ensureConnected();
    const now = new Date().toISOString();
    const payload = JSON.stringify({ ...doc, updatedAt: now });
    const meta = await this.writeFile(this.keyToFileName(doc.key), payload, options);
    return { ...doc, updatedAt: meta.updatedAt ?? now, revision: meta.revision };
  }

  async deleteDocument(key: string): Promise<void> {
    await this.ensureConnected();
    await this.removeFile(this.keyToFileName(key));
  }

  async listDocuments(): Promise<SettingsSummary[]> {
    await this.ensureConnected();
    const files = await this.listFiles();
    return files.map((f) => ({
      key: f.logicalKey,
      updatedAt: f.updatedAt ?? new Date(0).toISOString(),
      revision: f.revision,
    }));
  }
}
