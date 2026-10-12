import type { ProviderId } from './types.js';
import { AuthExchangeError, AuthRequiredError } from './errors.js';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: 'Bearer';
}

export interface OAuthClient {
  login(): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string>;
  getTokens(): Promise<OAuthTokens | null>;
  getAuthHeaders(): Promise<Record<string, string>>;
}

export interface OAuthProviderConfig {
  providerId: ProviderId;
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri: string;
  scopes: string[];
  extraAuthParams?: Record<string, string>;
}

export interface PendingAuthState {
  providerId: ProviderId;
  codeVerifier: string;
  state: string;
  createdAt: number;
}

/**
 * Persistence port for OAuth tokens (03-03). Runtimes supply their own
 * adapter: synchronous localStorage-backed stores on the web, promise-backed
 * secure stores on react-native. Both shapes are accepted; the TokenManager
 * normalizes with Promise.resolve.
 */
export interface TokenStore {
  get(providerId: string): OAuthTokens | null | Promise<OAuthTokens | null>;
  set(providerId: string, tokens: OAuthTokens): void | Promise<void>;
  remove(providerId: string): void | Promise<void>;
}

/** The subset of provider configuration the token lifecycle needs. */
export interface TokenManagerConfig {
  providerId: ProviderId;
  clientId: string;
  tokenEndpoint: string;
  redirectUri: string;
}

export interface TokenManagerOptions {
  config: TokenManagerConfig;
  tokenStore: TokenStore;
  fetchFn?: typeof fetch;
  /** Injectable wall clock (epoch ms) for deterministic expiry tests. */
  clock?: () => number;
}

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

interface TokenEndpointResponseJson {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

/**
 * Shared OAuth token lifecycle (03-03): the single implementation behind the
 * web and react-native OAuth clients. Both runtimes previously carried a ~90%
 * identical refresh/persist flow; they now differ only in the adapters they
 * inject here — token store, fetch, and clock.
 *
 * Failure semantics follow 02-06: only a genuine auth rejection (400/401/403)
 * kills the stored grant; transport and 5xx failures (AuthExchangeError)
 * preserve it so the refresh can be retried.
 */
export class TokenManager {
  private readonly config: TokenManagerConfig;
  private readonly tokenStore: TokenStore;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(options: TokenManagerOptions) {
    this.config = options.config;
    this.tokenStore = options.tokenStore;
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.clock ?? Date.now;
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

  private async parseTokens(response: Response, fallbackRefreshToken?: string): Promise<OAuthTokens> {
    const json = await response.json() as TokenEndpointResponseJson;
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? fallbackRefreshToken,
      expiresAt: json.expires_in ? this.now() + json.expires_in * 1000 : undefined,
      tokenType: (json.token_type as 'Bearer') ?? 'Bearer',
    };
  }

  /**
   * Completes an authorization-code exchange and persists the resulting
   * tokens. The login plumbing of each runtime (browser redirect callback,
   * expo AuthRequest result) resolves the code and verifier, then delegates
   * here.
   */
  async exchangeAuthorizationCode(code: string, codeVerifier?: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
    });

    if (codeVerifier) {
      params.append('code_verifier', codeVerifier);
    }

    const response = await this.postTokenForm(params);
    await requireTokenEndpointSuccess(response, this.config.providerId);

    const tokens = await this.parseTokens(response);
    await Promise.resolve(this.tokenStore.set(this.config.providerId, tokens));
    return tokens;
  }

  async getAccessToken(): Promise<string> {
    const tokens = await Promise.resolve(this.tokenStore.get(this.config.providerId));
    if (!tokens) {
      throw new AuthRequiredError(this.config.providerId);
    }

    if (tokens.expiresAt && tokens.expiresAt - this.now() < REFRESH_BUFFER_MS) {
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

    const newTokens = await this.parseTokens(response, tokens.refreshToken);
    await Promise.resolve(this.tokenStore.set(this.config.providerId, newTokens));
    return newTokens.accessToken;
  }
}
