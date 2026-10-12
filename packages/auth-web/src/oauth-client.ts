import type { OAuthClient, OAuthTokens, OAuthProviderConfig } from '@storage-bridge/core';
import type { TokenStore } from './token-store.js';
import type { CallbackResult } from './redirect-handler.js';
import { LocalStorageTokenStore } from './token-store.js';
import { generateCodeVerifier, generateCodeChallenge } from './pkce.js';
import { savePendingState, consumePendingState } from './redirect-handler.js';
import { AuthExchangeError, AuthRequiredError } from '@storage-bridge/core';

const REFRESH_BUFFER_MS = 60_000;
/** Max characters of a failed token-endpoint body kept for the error cause. */
const BODY_EXCERPT_MAX_CHARS = 200;

async function readBodyExcerpt(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, BODY_EXCERPT_MAX_CHARS);
  } catch {
    return '<unreadable body>';
  }
}

/**
 * Classifies a token-endpoint failure response (RFC 6749), distinguishing
 * genuine auth rejections from transport/server failures (02-06):
 *
 * - 400 (invalid_grant and friends) / 401 / 403: the grant or client is
 *   genuinely rejected — AuthRequiredError; the caller may clear credentials
 *   and request re-authentication.
 * - any other non-ok status (5xx, 404, 429, ...): a transport or server-side
 *   problem — AuthExchangeError with the HTTP status and body excerpt chained
 *   as cause; credentials must be preserved.
 *
 * Pure classification of the response; 200 responses return normally.
 */
export async function requireTokenEndpointSuccess(response: Response, providerId: string): Promise<void> {
  if (response.ok) return;

  const excerpt = await readBodyExcerpt(response);
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new AuthRequiredError(providerId);
  }

  throw new AuthExchangeError(providerId, new Error(`HTTP ${response.status}: ${excerpt || '<no body>'}`));
}

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

  /**
   * Posts the token-endpoint form body, wrapping fetch transport failures
   * (network errors) as AuthExchangeError with the original error as cause —
   * a network failure is never an auth rejection (02-06).
   */
  private async postTokenForm(params: URLSearchParams): Promise<Response> {
    try {
      return await this.fetchFn(this.config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
    } catch (error) {
      throw new AuthExchangeError(this.config.providerId, error instanceof Error ? error : new Error(String(error)));
    }
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

    const response = await this.postTokenForm(params);
    await requireTokenEndpointSuccess(response, this.config.providerId);

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

    await Promise.resolve(this.tokenStore.set(this.config.providerId, tokens));
  }

  async getAccessToken(): Promise<string> {
    const tokens = await Promise.resolve(this.tokenStore.get(this.config.providerId));
    if (!tokens) {
      throw new AuthRequiredError(this.config.providerId);
    }

    if (tokens.expiresAt && tokens.expiresAt - Date.now() < REFRESH_BUFFER_MS) {
      return this.refreshTokens(tokens);
    }

    return tokens.accessToken;
  }

  async getTokens(): Promise<OAuthTokens | null> {
    return Promise.resolve(this.tokenStore.get(this.config.providerId));
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }

  async logout(): Promise<void> {
    await Promise.resolve(this.tokenStore.remove(this.config.providerId));
  }

  private async refreshTokens(tokens: OAuthTokens): Promise<string> {
    if (!tokens.refreshToken) {
      await Promise.resolve(this.tokenStore.remove(this.config.providerId));
      throw new AuthRequiredError(this.config.providerId);
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: this.config.clientId,
    });

    const response = await this.postTokenForm(params);

    // Only a genuine auth rejection (400 invalid_grant / 401 / 403) kills the
    // stored grant; transport and 5xx failures (AuthExchangeError) preserve it
    // so the refresh can be retried (02-06).
    try {
      await requireTokenEndpointSuccess(response, this.config.providerId);
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        await Promise.resolve(this.tokenStore.remove(this.config.providerId));
      }
      throw error;
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

    await Promise.resolve(this.tokenStore.set(this.config.providerId, newTokens));
    return newTokens.accessToken;
  }
}
