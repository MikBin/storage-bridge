import { describe, it, expect } from 'vitest';
import { parseCallbackUrl, buildRedirectUri } from '../deep-link-handler.js';

describe('parseCallbackUrl', () => {
  it('extracts code and state from valid deep link', () => {
    const url = 'myapp://oauth/callback?code=auth-code-123&state=random-state';
    const result = parseCallbackUrl(url);
    expect(result).not.toBeNull();
    expect(result!.code).toBe('auth-code-123');
    expect(result!.state).toBe('random-state');
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
