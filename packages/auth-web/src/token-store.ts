import type { OAuthTokens } from './types.js';

export interface TokenStore {
  get(providerId: string): OAuthTokens | null | Promise<OAuthTokens | null>;
  set(providerId: string, tokens: OAuthTokens): void | Promise<void>;
  remove(providerId: string): void | Promise<void>;
}

export class LocalStorageTokenStore implements TokenStore {
  constructor(private readonly prefix: string = 'sb_auth_') {}

  get(providerId: string): OAuthTokens | null {
    const raw = localStorage.getItem(this.keyFor(providerId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OAuthTokens;
    } catch {
      return null;
    }
  }

  set(providerId: string, tokens: OAuthTokens): void {
    localStorage.setItem(this.keyFor(providerId), JSON.stringify(tokens));
  }

  remove(providerId: string): void {
    localStorage.removeItem(this.keyFor(providerId));
  }

  private keyFor(providerId: string): string {
    return `${this.prefix}${providerId}`;
  }
}

export class SessionStorageTokenStore implements TokenStore {
  constructor(private readonly prefix: string = 'sb_auth_') {}

  get(providerId: string): OAuthTokens | null {
    const raw = sessionStorage.getItem(this.keyFor(providerId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OAuthTokens;
    } catch {
      return null;
    }
  }

  set(providerId: string, tokens: OAuthTokens): void {
    sessionStorage.setItem(this.keyFor(providerId), JSON.stringify(tokens));
  }

  remove(providerId: string): void {
    sessionStorage.removeItem(this.keyFor(providerId));
  }

  private keyFor(providerId: string): string {
    return `${this.prefix}${providerId}`;
  }
}
