import type { OAuthClient, OAuthTokens, OAuthProviderConfig } from './types.js';
import type { TokenStore } from './token-store.js';
import type { CallbackResult } from './redirect-handler.js';
import { LocalStorageTokenStore } from './token-store.js';
import { generateCodeVerifier, generateCodeChallenge } from './pkce.js';
import { savePendingState, consumePendingState } from './redirect-handler.js';
import { AuthRequiredError } from '@storage-bridge/core';

const REFRESH_BUFFER_MS = 60_000;

export interface BrowserOAuthClientOptions {
  config: OAuthProviderConfig;
  tokenStore?: TokenStore;
  fetchFn?: typeof fetch;
}

export class BrowserOAuthClient implements OAuthClient {
  private readonly config: OAuthProviderConfig;
  private readonly tokenStore: TokenStore;
  private readonly fetchFn: typeof fetch;

  constructor(options: BrowserOAuthClientOptions) {
    this.config = options.config;
    this.tokenStore = options.tokenStore ?? new LocalStorageTokenStore();
    this.fetchFn = options.fetchFn ?? fetch;
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

  async completeAuthFlow(result: CallbackResult): Promise<void> {
    const pending = consumePendingState(result.state);
    if (!pending) {
      throw new AuthRequiredError(this.config.providerId);
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: result.code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: pending.codeVerifier,
    });

    const response = await this.fetchFn(this.config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new AuthRequiredError(this.config.providerId);
    }

    const json = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };

    const tokens: OAuthTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
      tokenType: (json.token_type as 'Bearer') ?? 'Bearer',
    };

    this.tokenStore.set(this.config.providerId, tokens);
  }

  async getAccessToken(): Promise<string> {
    const tokens = this.tokenStore.get(this.config.providerId);
    if (!tokens) {
      throw new AuthRequiredError(this.config.providerId);
    }

    if (tokens.expiresAt && tokens.expiresAt - Date.now() < REFRESH_BUFFER_MS) {
      return this.refreshTokens(tokens);
    }

    return tokens.accessToken;
  }

  async getTokens(): Promise<OAuthTokens | null> {
    return this.tokenStore.get(this.config.providerId);
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }

  async logout(): Promise<void> {
    this.tokenStore.remove(this.config.providerId);
  }

  private async refreshTokens(tokens: OAuthTokens): Promise<string> {
    if (!tokens.refreshToken) {
      this.tokenStore.remove(this.config.providerId);
      throw new AuthRequiredError(this.config.providerId);
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: this.config.clientId,
    });

    const response = await this.fetchFn(this.config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      this.tokenStore.remove(this.config.providerId);
      throw new AuthRequiredError(this.config.providerId);
    }

    const json = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };

    const newTokens: OAuthTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? tokens.refreshToken,
      expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
      tokenType: (json.token_type as 'Bearer') ?? 'Bearer',
    };

    this.tokenStore.set(this.config.providerId, newTokens);
    return newTokens.accessToken;
  }
}
