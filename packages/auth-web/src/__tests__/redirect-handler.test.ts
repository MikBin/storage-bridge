import { describe, it, expect, beforeEach } from 'vitest';
import { handleCallback, savePendingState, consumePendingState } from '../redirect-handler.js';
import type { PendingAuthState } from '../types.js';

const sampleState: PendingAuthState = {
  providerId: 'google-drive',
  codeVerifier: 'my-verifier-123',
  state: 'random-state-abc',
  createdAt: Date.now(),
};

describe('handleCallback', () => {
  it('returns null when URL has no auth params', () => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, search: '' },
      configurable: true,
      writable: true,
    });
    expect(handleCallback()).toBeNull();
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
      writable: true,
    });
  });

  it('extracts code and state from URL params', () => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, search: '?code=auth-code-xyz&state=state-abc' },
      configurable: true,
      writable: true,
    });
    const result = handleCallback();
    expect(result).not.toBeNull();
    expect(result!.code).toBe('auth-code-xyz');
    expect(result!.state).toBe('state-abc');
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
      writable: true,
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
