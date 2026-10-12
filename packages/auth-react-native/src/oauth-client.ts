import type { OAuthClient, OAuthTokens } from '@storage-bridge/core';
import { requireTokenEndpointSuccess } from '@storage-bridge/auth-web';
import type { ReactNativeOAuthConfig } from './types.js';
import { AuthRequest } from 'expo-auth-session';
import { AuthExchangeError, AuthRequiredError } from '@storage-bridge/core';
import { SecureTokenStore } from './secure-token-store.js';
import type { SecureStoreModule } from './secure-token-store.js';

const REFRESH_BUFFER_MS = 60_000;

const NO_VIABLE_SECURE_STORE_MESSAGE =
  'No viable secure token store is available: the optional dependency expo-secure-store could not be resolved. ' +
  'Install expo-secure-store (npx expo install expo-secure-store) or provide your own NativeTokenStore ' +
  'via the tokenStore option.';

const DIRECT_CONSTRUCTION_MESSAGE =
  'ReactNativeOAuthClient requires secure token persistence. ' +
  'Use ReactNativeOAuthClient.create({ config }) to resolve the expo-secure-store default, ' +
  'or provide a NativeTokenStore via the tokenStore option.';

function isViableSecureStore(candidate: unknown): candidate is SecureStoreModule {
  const secureStore = candidate as Partial<SecureStoreModule> | null;
  return typeof secureStore?.getItemAsync === 'function'
    && typeof secureStore?.setItemAsync === 'function'
    && typeof secureStore?.deleteItemAsync === 'function';
}

/**
 * Resolves expo-secure-store and returns it only when it exposes the full
 * secure-store surface; any resolution or inspection failure yields null so
 * the caller reports one accurate, actionable error.
 */
async function resolveViableSecureStore(): Promise<SecureStoreModule | null> {
  try {
    const candidate: unknown = await import('expo-secure-store');
    return isViableSecureStore(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the default NativeTokenStore: the secure store backed by
 * expo-secure-store when the module resolves, never a plaintext fallback.
 * Kept as a small standalone async factory so the 03-03 TokenManager
 * extraction into core can adopt it unchanged.
 */
export async function createDefaultTokenStore(): Promise<NativeTokenStore> {
  const secureStore = await resolveViableSecureStore();
  if (!secureStore) {
    throw new Error(NO_VIABLE_SECURE_STORE_MESSAGE);
  }
  return new SecureTokenStore(secureStore);
}

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

  /**
   * Async construction entry point. An explicitly provided tokenStore always
   * wins; otherwise the secure default is resolved dynamically from
   * expo-secure-store. When no viable store resolves, this rejects once with
   * an actionable message — never a silent plaintext fallback.
   */
  static async create(options: ReactNativeOAuthClientOptions): Promise<ReactNativeOAuthClient> {
    const tokenStore = options.tokenStore ?? await createDefaultTokenStore();
    return new ReactNativeOAuthClient({ ...options, tokenStore });
  }

  constructor(options: ReactNativeOAuthClientOptions) {
    this.config = options.config;
    if (!options.tokenStore) {
      throw new Error(DIRECT_CONSTRUCTION_MESSAGE);
    }
    this.tokenStore = options.tokenStore;
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
}
