import { describe, it, expectTypeOf } from 'vitest';
import type {
  ProviderId,
  Revision,
  SettingsEnvelope,
  SettingsSummary,
  ConnectedProfile,
  PutOptions,
  SettingsStore,
  DocumentStoreProvider,
  ProviderCapability,
  ProviderDescriptor,
} from '../types.js';

describe('Types', () => {
  it('ProviderId has correct literals', () => {
    expectTypeOf<'google-drive'>().toMatchTypeOf<ProviderId>();
    expectTypeOf<'dropbox'>().toMatchTypeOf<ProviderId>();
    expectTypeOf<'onedrive'>().toMatchTypeOf<ProviderId>();
    expectTypeOf<'icloud'>().toMatchTypeOf<ProviderId>();
    expectTypeOf<'local'>().toMatchTypeOf<ProviderId>();

    // @ts-expect-error Testing invalid provider id
    expectTypeOf<'invalid'>().toMatchTypeOf<ProviderId>();
  });

  it('SettingsEnvelope has expected structure', () => {
    type TestDoc = { foo: string };
    type Env = SettingsEnvelope<TestDoc>;

    expectTypeOf<Env['key']>().toBeString();
    expectTypeOf<Env['schemaVersion']>().toBeNumber();
    expectTypeOf<Env['updatedAt']>().toBeString();
    expectTypeOf<Env['revision']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Env['data']>().toEqualTypeOf<TestDoc>();
  });

  it('SettingsSummary has expected structure', () => {
    expectTypeOf<SettingsSummary['key']>().toBeString();
    expectTypeOf<SettingsSummary['updatedAt']>().toBeString();
    expectTypeOf<SettingsSummary['revision']>().toEqualTypeOf<string | undefined>();
  });

  it('ConnectedProfile has expected structure', () => {
    expectTypeOf<ConnectedProfile['provider']>().toEqualTypeOf<ProviderId>();
    expectTypeOf<ConnectedProfile['accountId']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ConnectedProfile['email']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ConnectedProfile['displayName']>().toEqualTypeOf<string | undefined>();
  });

  it('PutOptions has expected structure', () => {
    expectTypeOf<PutOptions['expectedRevision']>().toEqualTypeOf<Revision | undefined>();
  });

  it('SettingsStore has expected methods', () => {
    expectTypeOf<SettingsStore['connect']>().toEqualTypeOf<(provider: ProviderId) => Promise<void>>();
    expectTypeOf<SettingsStore['disconnect']>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<SettingsStore['currentProvider']>().toEqualTypeOf<() => ProviderId | null>();
    expectTypeOf<SettingsStore['isConnected']>().toEqualTypeOf<() => Promise<boolean>>();
    expectTypeOf<SettingsStore['getProfile']>().toEqualTypeOf<() => Promise<ConnectedProfile | null>>();

    expectTypeOf<SettingsStore['get']>().toEqualTypeOf<<T>(key: string) => Promise<SettingsEnvelope<T> | null>>();
    expectTypeOf<SettingsStore['put']>().toEqualTypeOf<<T>(key: string, data: T, options?: PutOptions) => Promise<SettingsEnvelope<T>>>();
    expectTypeOf<SettingsStore['delete']>().toEqualTypeOf<(key: string) => Promise<void>>();
    expectTypeOf<SettingsStore['list']>().toEqualTypeOf<() => Promise<SettingsSummary[]>>();
  });

  it('DocumentStoreProvider has expected methods', () => {
    expectTypeOf<DocumentStoreProvider['id']>().toEqualTypeOf<ProviderId>();

    expectTypeOf<DocumentStoreProvider['connect']>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<DocumentStoreProvider['disconnect']>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<DocumentStoreProvider['isConnected']>().toEqualTypeOf<() => Promise<boolean>>();
    expectTypeOf<DocumentStoreProvider['getProfile']>().toEqualTypeOf<() => Promise<ConnectedProfile | null>>();

    expectTypeOf<DocumentStoreProvider['getDocument']>().toEqualTypeOf<<T>(key: string) => Promise<SettingsEnvelope<T> | null>>();
    expectTypeOf<DocumentStoreProvider['putDocument']>().toEqualTypeOf<<T>(doc: SettingsEnvelope<T>, options?: PutOptions) => Promise<SettingsEnvelope<T>>>();
    expectTypeOf<DocumentStoreProvider['deleteDocument']>().toEqualTypeOf<(key: string) => Promise<void>>();
    expectTypeOf<DocumentStoreProvider['listDocuments']>().toEqualTypeOf<() => Promise<SettingsSummary[]>>();
  });

  it('ProviderCapability has correct literals', () => {
    expectTypeOf<'web'>().toMatchTypeOf<ProviderCapability>();
    expectTypeOf<'react-native'>().toMatchTypeOf<ProviderCapability>();
    expectTypeOf<'ios'>().toMatchTypeOf<ProviderCapability>();
    expectTypeOf<'android'>().toMatchTypeOf<ProviderCapability>();
    expectTypeOf<'offline-cache'>().toMatchTypeOf<ProviderCapability>();
    expectTypeOf<'least-privilege-app-scope'>().toMatchTypeOf<ProviderCapability>();
    expectTypeOf<'pkce-oauth'>().toMatchTypeOf<ProviderCapability>();
    expectTypeOf<'apple-only-runtime'>().toMatchTypeOf<ProviderCapability>();

    // @ts-expect-error Testing invalid capability
    expectTypeOf<'invalid'>().toMatchTypeOf<ProviderCapability>();
  });

  it('ProviderDescriptor has expected structure', () => {
    expectTypeOf<ProviderDescriptor['id']>().toEqualTypeOf<ProviderId>();
    expectTypeOf<ProviderDescriptor['label']>().toBeString();
    expectTypeOf<ProviderDescriptor['capabilities']>().toEqualTypeOf<ProviderCapability[]>();
    expectTypeOf<ProviderDescriptor['isSupported']>().toEqualTypeOf<() => Promise<boolean>>();
    expectTypeOf<ProviderDescriptor['create']>().toEqualTypeOf<() => DocumentStoreProvider>();
  });
});
