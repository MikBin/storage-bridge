import type { OAuthTokens } from './types.js';

/**
 * Pluggable token storage interface.
 * Implementations store and retrieve OAuth tokens keyed by provider ID.
 */
export interface TokenStore {
  get(providerId: string): OAuthTokens | null;
  set(providerId: string, tokens: OAuthTokens): void;
  remove(providerId: string): void;
}

/**
 * localStorage-backed token store.
 * Survives browser restarts. Default choice for long-lived sessions.
 */
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

/**
 * sessionStorage-backed token store.
 * Clears when the tab closes. Better security for sensitive apps.
 */
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
