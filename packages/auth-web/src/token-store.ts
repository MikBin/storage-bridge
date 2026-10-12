import type { OAuthTokens } from './types.js';
import type { TokenStore } from '@storage-bridge/core';

// The TokenStore port is owned by core (03-03); re-exported so the auth-web
// surface keeps exposing it alongside the stores that implement it.
export type { TokenStore };

/**
 * Default token store (03-01 / D1): keeps tokens in instance memory only.
 * Nothing is written to localStorage, sessionStorage, or cookies, so an XSS
 * injection cannot exfiltrate long-lived refresh tokens from persistent web
 * storage. The trade-off is that tokens do not survive a page reload — the
 * client signals AuthRequiredError and the consumer re-runs login().
 * See README.md ("Token storage") for the full threat model.
 */
export class InMemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, OAuthTokens>();

  get(providerId: string): OAuthTokens | null {
    return this.tokens.get(providerId) ?? null;
  }

  set(providerId: string, tokens: OAuthTokens): void {
    this.tokens.set(providerId, tokens);
  }

  remove(providerId: string): void {
    this.tokens.delete(providerId);
  }
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
