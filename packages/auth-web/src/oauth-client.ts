import type { OAuthClient, OAuthProviderConfig, OAuthTokens } from '@storage-bridge/core';
import { TokenManager, isPendingStateUsable } from '@storage-bridge/core';
import type { TokenStore } from './token-store.js';
import type { CallbackResult } from './redirect-handler.js';
import { LocalStorageTokenStore } from './token-store.js';
import { generateCodeVerifier, generateCodeChallenge } from './pkce.js';
import { savePendingState, consumePendingState } from './redirect-handler.js';
import { AuthRequiredError } from '@storage-bridge/core';

// Compat re-export: the token-endpoint response classifier moved to core
// (03-03); the auth-web export surface is preserved for existing importers.
export { requireTokenEndpointSuccess } from '@storage-bridge/core';

export interface BrowserOAuthClientOptions {
  config: OAuthProviderConfig;
  tokenStore?: TokenStore;
  fetchFn?: typeof fetch;
}

/**
 * Browser login adapter (03-03): owns the redirect flow (PKCE generation,
 * pending-state persistence, page redirect, callback completion) and
 * delegates the entire token lifecycle to the shared core TokenManager.
 */
export class BrowserOAuthClient implements OAuthClient {
  private readonly config: OAuthProviderConfig;
  private readonly tokens: TokenManager;

  constructor(options: BrowserOAuthClientOptions) {
    this.config = options.config;
    this.tokens = new TokenManager({
      config: options.config,
      tokenStore: options.tokenStore ?? new LocalStorageTokenStore(),
      fetchFn: options.fetchFn,
    });
  }

  async login(): Promise<void> {
    const codeVerifier = await generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = crypto.randomUUID();

    savePendingState({
      providerId: this.config.providerId,
      codeVerifier,
      state,
      createdAt: Date.now(),
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    if (this.config.extraAuthParams) {
      for (const [key, value] of Object.entries(this.config.extraAuthParams)) {
        params.set(key, value);
      }
    }

    const authUrl = `${this.config.authorizationEndpoint}?${params.toString()}`;
    window.location.assign(authUrl);
  }

  /**
   * Completes a login from a discriminated callback result (03-04): provider
   * errors and non-callbacks reject as AuthRequiredError without touching
   * the token endpoint. A callback proceeds only when its pending state
   * matches this provider and is younger than PENDING_STATE_TTL_MS —
   * stale-state replay cannot complete the code exchange.
   */
  async completeAuthFlow(result: CallbackResult): Promise<void> {
    if (!result || result.kind === 'error') {
      throw new AuthRequiredError(this.config.providerId);
    }

    const pending = consumePendingState(result.state);
    if (!pending || !isPendingStateUsable(pending, this.config.providerId, Date.now())) {
      throw new AuthRequiredError(this.config.providerId);
    }

    await this.tokens.exchangeAuthorizationCode(result.code, pending.codeVerifier);
  }

  getAccessToken(): Promise<string> {
    return this.tokens.getAccessToken();
  }

  getTokens(): Promise<OAuthTokens | null> {
    return this.tokens.getTokens();
  }

  getAuthHeaders(): Promise<Record<string, string>> {
    return this.tokens.getAuthHeaders();
  }

  logout(): Promise<void> {
    return this.tokens.logout();
  }
}
