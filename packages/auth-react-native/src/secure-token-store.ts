import type { OAuthTokens } from '@storage-bridge/auth-web';

/**
 * Structural surface of the expo-secure-store module that SecureTokenStore
 * needs. The module is injected rather than statically imported so the
 * package stays loadable on runtimes (tests, plain Node) where
 * expo-secure-store cannot resolve; the default-store factory in
 * oauth-client.ts resolves it dynamically and passes it in.
 */
export interface SecureStoreModule {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export class SecureTokenStore {
  constructor(
    private readonly secureStore: SecureStoreModule,
    private readonly prefix: string = 'sb_auth_',
  ) {}

  async get(providerId: string): Promise<OAuthTokens | null> {
    const raw = await this.secureStore.getItemAsync(this.keyFor(providerId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OAuthTokens;
    } catch {
      return null;
    }
  }

  async set(providerId: string, tokens: OAuthTokens): Promise<void> {
    await this.secureStore.setItemAsync(this.keyFor(providerId), JSON.stringify(tokens));
  }

  async remove(providerId: string): Promise<void> {
    await this.secureStore.deleteItemAsync(this.keyFor(providerId));
  }

  private keyFor(providerId: string): string {
    return `${this.prefix}${providerId}`;
  }
}
