import { describe, it, expect } from 'vitest';
import { generateCodeVerifier, generateCodeChallenge } from '../pkce.js';

describe('generateCodeVerifier', () => {
  it('returns a base64url-encoded string of 43 characters', async () => {
    const verifier = await generateCodeVerifier();
    expect(verifier).toHaveLength(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns different values on successive calls', async () => {
    const a = await generateCodeVerifier();
    const b = await generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe('generateCodeChallenge', () => {
  it('returns a base64url-encoded string', async () => {
    const verifier = await generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is deterministic — same verifier produces same challenge', async () => {
    const verifier = 'test-verifier-value-for-determinism-check';
    const a = await generateCodeChallenge(verifier);
    const b = await generateCodeChallenge(verifier);
    expect(a).toBe(b);
  });

  it('produces different challenges for different verifiers', async () => {
    const challengeA = await generateCodeChallenge('verifier-a');
    const challengeB = await generateCodeChallenge('verifier-b');
    expect(challengeA).not.toBe(challengeB);
  });
});
