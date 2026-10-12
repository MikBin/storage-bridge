import { describe, it, expect } from 'vitest';
import {
  parseCallbackUrl,
  buildRedirectUri,
  savePendingState,
  consumePendingState,
} from '../deep-link-handler.js';
import type { PendingAuthState } from '@storage-bridge/core';

describe('parseCallbackUrl', () => {
  it('extracts code and state from valid deep link', () => {
    const url = 'myapp://oauth/callback?code=auth-code-123&state=random-state';
    const result = parseCallbackUrl(url);
    expect(result).toEqual({ kind: 'callback', code: 'auth-code-123', state: 'random-state' });
  });

  it('returns null for URL without auth params', () => {
    const url = 'myapp://oauth/callback';
    const result = parseCallbackUrl(url);
    expect(result).toBeNull();
  });

  it('returns null for URL with only code (missing state)', () => {
    const url = 'myapp://oauth/callback?code=auth-code';
    const result = parseCallbackUrl(url);
    expect(result).toBeNull();
  });

  it('returns null for URL with only state (missing code)', () => {
    const url = 'myapp://oauth/callback?state=some-state';
    const result = parseCallbackUrl(url);
    expect(result).toBeNull();
  });

  it('returns null for malformed URL', () => {
    expect(parseCallbackUrl('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCallbackUrl('')).toBeNull();
  });
});

describe('parseCallbackUrl (discriminated result, 03-04)', () => {
  // bypass: fast-check not installed; deterministic deep-link error matrix —
  // provider error with and without error_description, and the error param
  // taking precedence over a code, mirroring the web redirect-handler.
  const ERROR_CASES: ReadonlyArray<{ name: string; url: string; expected: unknown }> = [
    {
      name: 'provider error preserves error and error_description',
      url: 'myapp://oauth/callback?error=access_denied&error_description=User+denied+access',
      expected: { kind: 'error', error: 'access_denied', error_description: 'User denied access' },
    },
    {
      name: 'provider error without description keeps error_description null',
      url: 'myapp://oauth/callback?error=server_error',
      expected: { kind: 'error', error: 'server_error', error_description: null },
    },
    {
      name: 'error param takes precedence over code and state',
      url: 'myapp://oauth/callback?error=access_denied&code=c&state=s',
      expected: { kind: 'error', error: 'access_denied', error_description: null },
    },
  ];

  it.each(ERROR_CASES)('$name', ({ url, expected }) => {
    expect(parseCallbackUrl(url)).toEqual(expected);
  });
});

describe('savePendingState / consumePendingState (03-04)', () => {
  const sampleState: PendingAuthState = {
    providerId: 'google-drive',
    codeVerifier: 'my-verifier-123',
    state: 'random-state-abc',
    createdAt: Date.now(),
  };

  it('round-trips pending state', () => {
    savePendingState(sampleState);
    expect(consumePendingState(sampleState.state)).toEqual(sampleState);
  });

  it('returns null for unknown state', () => {
    savePendingState(sampleState);
    expect(consumePendingState('wrong-state')).toBeNull();
  });

  it('clears state after consumption so replay cannot re-enter', () => {
    savePendingState(sampleState);
    expect(consumePendingState(sampleState.state)).toEqual(sampleState);
    expect(consumePendingState(sampleState.state)).toBeNull();
  });
});

describe('buildRedirectUri', () => {
  it('constructs correct URI with default path', () => {
    const uri = buildRedirectUri('myapp');
    expect(uri).toBe('myapp://oauth/callback');
  });

  it('constructs URI with custom path', () => {
    const uri = buildRedirectUri('myapp', 'auth/return');
    expect(uri).toBe('myapp://auth/return');
  });

  it('handles scheme with trailing colon', () => {
    const uri = buildRedirectUri('myapp:');
    expect(uri).toBe('myapp://oauth/callback');
  });
});
