import type { OAuthClient, OAuthTokens } from '@storage-bridge/core';
import { TokenManager, isPendingStateUsable } from '@storage-bridge/core';
import type { ReactNativeOAuthConfig } from './types.js';
import { AuthRequest } from 'expo-auth-session';
import { AuthRequiredError } from '@storage-bridge/core';
import { SecureTokenStore } from './secure-token-store.js';
import type { SecureStoreModule } from './secure-token-store.js';
import type { ParsedCallback } from './deep-link-handler.js';
import { consumePendingState } from './deep-link-handler.js';

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
  return (
    typeof secureStore?.getItemAsync === 'function' &&
    typeof secureStore?.setItemAsync === 'function' &&
    typeof secureStore?.deleteItemAsync === 'function'
  );
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

/**
 * React Native login adapter (03-03): owns the expo AuthRequest /
 * deep-link flow and delegates the entire token lifecycle to the shared core
 * TokenManager (the runtimes differ only in the adapters they inject).
 */
export class ReactNativeOAuthClient implements OAuthClient {
  private readonly config: ReactNativeOAuthConfig;
  private readonly tokens: TokenManager;

  /**
   * Async construction entry point. An explicitly provided tokenStore always
   * wins; otherwise the secure default is resolved dynamically from
   * expo-secure-store. When no viable store resolves, this rejects once with
   * an actionable message — never a silent plaintext fallback.
   */
  static async create(options: ReactNativeOAuthClientOptions): Promise<ReactNativeOAuthClient> {
    const tokenStore = options.tokenStore ?? (await createDefaultTokenStore());
    return new ReactNativeOAuthClient({ ...options, tokenStore });
  }

  constructor(options: ReactNativeOAuthClientOptions) {
    this.config = options.config;
    if (!options.tokenStore) {
      throw new Error(DIRECT_CONSTRUCTION_MESSAGE);
    }
    this.tokens = new TokenManager({
      config: options.config,
      tokenStore: options.tokenStore,
      fetchFn: options.fetchFn,
    });
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

    await this.tokens.exchangeAuthorizationCode(code, request.codeVerifier);
  }

  /**
   * Completes a login from a parsed deep-link callback (03-04): provider
   * errors and non-callbacks reject as AuthRequiredError without touching
   * the token endpoint. A callback proceeds only when its pending state
   * (saved via savePendingState before the browser session opened) matches
   * this provider and is younger than PENDING_STATE_TTL_MS — stale-state
   * replay cannot complete the code exchange.
   */
  async completeAuthFlow(callback: ParsedCallback): Promise<void> {
    if (!callback || callback.kind === 'error') {
      throw new AuthRequiredError(this.config.providerId);
    }

    const pending = consumePendingState(callback.state);
    if (!pending || !isPendingStateUsable(pending, this.config.providerId, Date.now())) {
      throw new AuthRequiredError(this.config.providerId);
    }

    await this.tokens.exchangeAuthorizationCode(callback.code, pending.codeVerifier);
  }

  logout(): Promise<void> {
    return this.tokens.logout();
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
}
