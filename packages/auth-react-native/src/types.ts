import type { ProviderId } from '@storage-bridge/core';

export interface ReactNativeOAuthConfig {
  providerId: ProviderId;
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
  redirectUri: string;
  extraAuthParams?: Record<string, string>;
}
