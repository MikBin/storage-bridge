import type { PendingAuthState } from '@storage-bridge/core';

/**
 * Discriminated deep-link callback outcome (03-04): mirrors the web
 * redirect-handler — a success carries code+state, a provider error carries
 * the RFC 6749 error code and its optional error_description verbatim, and
 * null means the URL is not an OAuth callback at all.
 */
export type ParsedCallback =
  | { kind: 'callback'; code: string; state: string }
  | { kind: 'error'; error: string; error_description: string | null }
  | null;

export function parseCallbackUrl(url: string): ParsedCallback {
  if (!url) return null;

  try {
    const parseable = url.includes('://') ? `http${url.substring(url.indexOf('://'))}` : url;
    const parsed = new URL(parseable);

    const error = parsed.searchParams.get('error');
    if (error) {
      return {
        kind: 'error',
        error,
        error_description: parsed.searchParams.get('error_description'),
      };
    }

    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');

    if (!code || !state) return null;

    return { kind: 'callback', code, state };
  } catch {
    return null;
  }
}

/**
 * In-process pending-state registry for the deep-link flow (03-04): the JS
 * runtime instance survives the round-trip through the system browser, so
 * this module-level map plays the role the web's sessionStorage plays. The
 * app saves the pending state before opening the authorization browser
 * session; the deep-link completion consumes it exactly once.
 */
const pendingStates = new Map<string, PendingAuthState>();

export function savePendingState(pending: PendingAuthState): void {
  pendingStates.set(pending.state, { ...pending });
}

export function consumePendingState(state: string): PendingAuthState | null {
  const pending = pendingStates.get(state);
  if (!pending) return null;

  pendingStates.delete(state);
  return pending;
}

export function buildRedirectUri(scheme: string, path: string = 'oauth/callback'): string {
  const cleanScheme = scheme.replace(/:$/, '');
  return `${cleanScheme}://${path}`;
}
