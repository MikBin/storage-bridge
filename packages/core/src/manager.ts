import {
  NotConnectedError,
  ProviderUnavailableError,
  UnsupportedProviderError,
} from './errors.js';
import type {
  ConnectedProfile,
  DocumentStoreProvider,
  ProviderDescriptor,
  ProviderId,
  PutOptions,
  SettingsEnvelope,
  SettingsStore,
  SettingsSummary,
} from './types.js';

export class DefaultSettingsStore implements SettingsStore {
  private current: DocumentStoreProvider | null = null;

  constructor(private readonly registry: Map<ProviderId, ProviderDescriptor>) {}

  public async connect(providerId: ProviderId): Promise<void> {
    const descriptor = this.registry.get(providerId);
    if (!descriptor) {
      throw new UnsupportedProviderError(providerId);
    }

    const supported = await descriptor.isSupported();
    if (!supported) {
      throw new ProviderUnavailableError(providerId);
    }

    if (this.current) {
      await this.current.disconnect();
      this.current = null;
    }

    const provider = descriptor.create();
    await provider.connect();
    this.current = provider;
  }

  public async disconnect(): Promise<void> {
    if (this.current) {
      await this.current.disconnect();
      this.current = null;
    }
  }

  public currentProvider(): ProviderId | null {
    return this.current?.id ?? null;
  }

  public async isConnected(): Promise<boolean> {
    if (!this.current) return false;
    return this.current.isConnected();
  }

  public async getProfile(): Promise<ConnectedProfile | null> {
    if (!this.current) return null;
    return this.current.getProfile();
  }

  public async get<T>(key: string): Promise<SettingsEnvelope<T> | null> {
    this.ensureCurrent();
    return this.current!.getDocument<T>(key);
  }

  public async put<T>(key: string, data: T, options?: PutOptions): Promise<SettingsEnvelope<T>> {
    this.ensureCurrent();

    const existing = await this.current!.getDocument<T>(key);

    // Optimistic by default (Decision D2): the revision read immediately
    // above becomes the expected revision, so a write whose remote state
    // advanced in the meantime rejects with ConflictError instead of losing
    // updates. `force` opts out into a blind last-writer-wins overwrite; an
    // explicit caller expectation always takes precedence.
    const expectedRevision = options?.force
      ? undefined
      : options?.expectedRevision ?? existing?.revision;

    const doc: SettingsEnvelope<T> = {
      key,
      schemaVersion: existing?.schemaVersion ?? 1,
      updatedAt: new Date().toISOString(),
      revision: existing?.revision,
      data,
    };

    return this.current!.putDocument(doc, { ...options, expectedRevision });
  }

  public async delete(key: string): Promise<void> {
    this.ensureCurrent();
    return this.current!.deleteDocument(key);
  }

  public async list(): Promise<SettingsSummary[]> {
    this.ensureCurrent();
    return this.current!.listDocuments();
  }

  private ensureCurrent(): void {
    if (!this.current) {
      throw new NotConnectedError();
    }
  }
}
