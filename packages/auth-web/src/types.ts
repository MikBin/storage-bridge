import type { ProviderId } from '@storage-bridge/core';

/**
 * OAuth token set stored after successful authentication.
 */
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Unix timestamp in milliseconds when the access token expires */
  expiresAt?: number;
  tokenType?: 'Bearer';
}

/**
 * Auth client interface satisfied by BrowserOAuthClient.
 * Provider adapters depend on this interface, not the concrete class.
 */
export interface OAuthClient {
  login(): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string>;
  getTokens(): Promise<OAuthTokens | null>;
  getAuthHeaders(): Promise<Record<string, string>>;
}

/**
 * Provider-specific OAuth configuration.
 * Each provider package (google-drive, dropbox, onedrive) provides one of these.
 */
export interface OAuthProviderConfig {
  /** Provider identifier for storage namespacing */
  providerId: ProviderId;
  /** OAuth 2.0 client ID */
  clientId: string;
  /** Authorization endpoint URL */
  authorizationEndpoint: string;
  /** Token endpoint URL */
  tokenEndpoint: string;
  /** Redirect URI (typically window.location.origin + callback path) */
  redirectUri: string;
  /** OAuth scopes to request */
  scopes: string[];
  /** Optional additional auth params (e.g., prompt, access_type) */
  extraAuthParams?: Record<string, string>;
}

/**
 * State persisted to sessionStorage during the redirect flow.
 * Used to verify the callback and complete the PKCE exchange.
 */
export interface PendingAuthState {
  providerId: ProviderId;
  codeVerifier: string;
  state: string;
  createdAt: number;
}
