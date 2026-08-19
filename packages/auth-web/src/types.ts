import type { ProviderId, OAuthTokens, OAuthClient } from '@storage-bridge/core';

export type { OAuthTokens, OAuthClient };

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
