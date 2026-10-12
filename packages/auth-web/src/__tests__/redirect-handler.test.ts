import { describe, it, expect, beforeEach } from 'vitest';
import { handleCallback, savePendingState, consumePendingState } from '../redirect-handler.js';
import type { PendingAuthState } from '../types.js';

const sampleState: PendingAuthState = {
  providerId: 'google-drive',
  codeVerifier: 'my-verifier-123',
  state: 'random-state-abc',
  createdAt: Date.now(),
};

function withLocationSearch(search: string, run: () => void): void {
  const originalLocation = window.location;
  // @ts-expect-error mock location search
  delete window.location;
  // @ts-expect-error mock location search
  window.location = { ...originalLocation, search };
  try {
    run();
  } finally {
    // @ts-expect-error mock location search
    window.location = originalLocation;
  }
}

describe('handleCallback (discriminated result, 03-04)', () => {
  // bypass: fast-check not installed; deterministic callback-URL matrix —
  // success / provider error with and without error_description / error
  // taking precedence over code / partial params / not a callback.
  const CASES: ReadonlyArray<{ name: string; search: string; expected: unknown }> = [
    {
      name: 'success callback carries code and state',
      search: '?code=auth-code-xyz&state=state-abc',
      expected: { kind: 'callback', code: 'auth-code-xyz', state: 'state-abc' },
    },
    {
      name: 'provider error preserves error and error_description',
      search: '?error=access_denied&error_description=User+denied+access',
      expected: { kind: 'error', error: 'access_denied', error_description: 'User denied access' },
    },
    {
      name: 'provider error without description keeps error_description null',
      search: '?error=server_error',
      expected: { kind: 'error', error: 'server_error', error_description: null },
    },
    {
      name: 'error param takes precedence over code and state',
      search: '?error=access_denied&code=x&state=y',
      expected: { kind: 'error', error: 'access_denied', error_description: null },
    },
    { name: 'code without state is not a callback', search: '?code=orphan-code', expected: null },
    { name: 'state without code is not a callback', search: '?state=orphan-state', expected: null },
    { name: 'no auth params is not a callback', search: '', expected: null },
    { name: 'unrelated params are not a callback', search: '?foo=bar', expected: null },
  ];

  it.each(CASES)('$name', ({ search, expected }) => {
    withLocationSearch(search, () => {
      expect(handleCallback()).toEqual(expected);
    });
  });
});

describe('savePendingState / consumePendingState', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips pending state', () => {
    savePendingState(sampleState);
    const retrieved = consumePendingState(sampleState.state);
    expect(retrieved).toEqual(sampleState);
  });

  it('returns null for unknown state', () => {
    savePendingState(sampleState);
    expect(consumePendingState('wrong-state')).toBeNull();
  });

  it('clears state after consumption', () => {
    savePendingState(sampleState);
    consumePendingState(sampleState.state);
    expect(consumePendingState(sampleState.state)).toBeNull();
  });
});
