import type { ProviderId } from '@storage-bridge/core';

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
