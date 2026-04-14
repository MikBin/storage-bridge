export type ProviderId =
  | 'google-drive'
  | 'dropbox'
  | 'onedrive'
  | 'icloud'
  | 'local';

export type Revision = string;

export interface SettingsEnvelope<T> {
  key: string;
  schemaVersion: number;
  updatedAt: string;
  revision?: Revision;
  data: T;
}

export interface SettingsSummary {
  key: string;
  updatedAt: string;
  revision?: Revision;
}

export interface ConnectedProfile {
  provider: ProviderId;
  accountId?: string;
  email?: string;
  displayName?: string;
}

export interface PutOptions {
  expectedRevision?: Revision;
}

export interface SettingsStore {
  connect(provider: ProviderId): Promise<void>;
  disconnect(): Promise<void>;
  currentProvider(): ProviderId | null;
  isConnected(): Promise<boolean>;
  getProfile(): Promise<ConnectedProfile | null>;

  get<T>(key: string): Promise<SettingsEnvelope<T> | null>;
  put<T>(key: string, data: T, options?: PutOptions): Promise<SettingsEnvelope<T>>;
  delete(key: string): Promise<void>;
  list(): Promise<SettingsSummary[]>;
}

export interface DocumentStoreProvider {
  readonly id: ProviderId;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
  getProfile(): Promise<ConnectedProfile | null>;

  getDocument<T>(key: string): Promise<SettingsEnvelope<T> | null>;
  putDocument<T>(doc: SettingsEnvelope<T>, options?: PutOptions): Promise<SettingsEnvelope<T>>;
  deleteDocument(key: string): Promise<void>;
  listDocuments(): Promise<SettingsSummary[]>;
}

export type ProviderCapability =
  | 'web'
  | 'react-native'
  | 'ios'
  | 'android'
  | 'offline-cache'
  | 'least-privilege-app-scope'
  | 'pkce-oauth'
  | 'apple-only-runtime';

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  capabilities: ProviderCapability[];
  isSupported(): Promise<boolean>;
  create(): DocumentStoreProvider;
}
