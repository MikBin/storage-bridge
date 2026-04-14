import type { OAuthTokens } from '@storage-bridge/auth-web';
import * as SecureStore from 'expo-secure-store';

export class SecureTokenStore {
  constructor(private readonly prefix: string = 'sb_auth_') {}

  async get(providerId: string): Promise<OAuthTokens | null> {
    const raw = await SecureStore.getItemAsync(this.keyFor(providerId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OAuthTokens;
    } catch {
      return null;
    }
  }

  async set(providerId: string, tokens: OAuthTokens): Promise<void> {
    await SecureStore.setItemAsync(this.keyFor(providerId), JSON.stringify(tokens));
  }

  async remove(providerId: string): Promise<void> {
    await SecureStore.deleteItemAsync(this.keyFor(providerId));
  }

  private keyFor(providerId: string): string {
    return `${this.prefix}${providerId}`;
  }
}
