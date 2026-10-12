import { describe, it, expect, vi } from 'vitest';
import { ReactNativeOAuthClient } from '../oauth-client.js';
import type { ReactNativeOAuthConfig } from '../types.js';

vi.mock('expo-auth-session', () => {
  return {
    AuthRequest: class {
      codeVerifier = 'mock-verifier';
      promptAsync = vi.fn();
    }
  };
});

// No vi.mock for 'expo-secure-store' here: outside a native runtime the
// module cannot resolve, so the real import failure drives the absent path.

const mockConfig: ReactNativeOAuthConfig = {
  providerId: 'google-drive',
  clientId: 'native-client-id',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  redirectUri: 'myapp://oauth/callback',
};

async function captureRejection(operation: Promise<unknown>): Promise<unknown> {
  try {
    return await operation;
  } catch (error) {
    return error;
  }
}

describe('default token store resolution — expo-secure-store absent (02-07)', () => {
  // bypass: fast-check not installed; the absent path is the real Node
  // behavior — expo-secure-store cannot resolve outside a native runtime,
  // so the genuine dynamic-import failure drives these cases.

  it('createDefaultTokenStore rejects naming expo-secure-store and the explicit-store remediation', async () => {
    const clientModule = await import('../oauth-client.js');

    const error = await captureRejection(clientModule.createDefaultTokenStore());

    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).toContain('expo-secure-store');
    expect(String((error as Error).message)).toContain('tokenStore');
  });

  it('create() without an explicit store rejects with the same actionable error instead of a plaintext fallback', async () => {
    const error = await captureRejection(ReactNativeOAuthClient.create({ config: mockConfig }));

    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).toContain('expo-secure-store');
    expect(String((error as Error).message)).toContain('tokenStore');
  });
});
