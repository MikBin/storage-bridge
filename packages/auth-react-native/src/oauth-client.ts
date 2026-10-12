import type { OAuthClient, OAuthTokens } from '@storage-bridge/auth-web';
import { requireTokenEndpointSuccess } from '@storage-bridge/auth-web';
import type { ReactNativeOAuthConfig } from './types.js';
import { AuthRequest } from 'expo-auth-session';
import { AuthExchangeError, AuthRequiredError } from '@storage-bridge/core';

const REFRESH_BUFFER_MS = 60_000;

export interface NativeTokenStore {
  get(providerId: string): Promise<OAuthTokens | null>;
  set(providerId: string, tokens: OAuthTokens): Promise<void>;
  remove(providerId: string): Promise<void>;
}

export interface ReactNativeOAuthClientOptions {
  config: ReactNativeOAuthConfig;
  tokenStore?: NativeTokenStore;
  fetchFn?: typeof fetch;
}

export class ReactNativeOAuthClient implements OAuthClient {
  private readonly config: ReactNativeOAuthConfig;
  private readonly tokenStore: NativeTokenStore;
  private readonly fetchFn: typeof fetch;

  constructor(options: ReactNativeOAuthClientOptions) {
    this.config = options.config;
    this.tokenStore = options.tokenStore ?? this.createDefaultTokenStore();
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /**
   * Posts the token-endpoint form body, wrapping fetch transport failures
   * (network errors) as AuthExchangeError with the original error as cause —
   * a network failure is never an auth rejection (02-06). Shares the pure
   * response classifier with the web client for the 03-03 TokenManager split.
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

  async login(): Promise<void> {
    const request = new AuthRequest({
      clientId: this.config.clientId,
      scopes: this.config.scopes,
      redirectUri: this.config.redirectUri,
      extraParams: this.config.extraAuthParams,
      usePKCE: true,
    });

    const result = await request.promptAsync({
      authorizationEndpoint: this.config.authorizationEndpoint,
    });

    if (result.type !== 'success') {
      throw new AuthRequiredError(this.config.providerId);
    }

    const code = result.params?.code;
    if (!code) {
      throw new AuthRequiredError(this.config.providerId);
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
    });

    if (request.codeVerifier) {
      tokenParams.append('code_verifier', request.codeVerifier);
    }

    const response = await this.postTokenForm(tokenParams);
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

    await this.tokenStore.set(this.config.providerId, tokens);
  }

  async logout(): Promise<void> {
    await this.tokenStore.remove(this.config.providerId);
  }

  async getAccessToken(): Promise<string> {
    const tokens = await this.tokenStore.get(this.config.providerId);
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

  private async refreshTokens(tokens: OAuthTokens): Promise<string> {
    if (!tokens.refreshToken) {
      await this.tokenStore.remove(this.config.providerId);
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
        await this.tokenStore.remove(this.config.providerId);
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

    await this.tokenStore.set(this.config.providerId, newTokens);
    return newTokens.accessToken;
  }

  private createDefaultTokenStore(): NativeTokenStore {
    throw new Error(
      'SecureTokenStore requires expo-secure-store. ' +
      'Please provide a tokenStore option or ensure expo-secure-store is installed.',
    );
  }
}
