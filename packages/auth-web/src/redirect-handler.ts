import type { PendingAuthState } from './types.js';

const PKCE_STORAGE_PREFIX = 'sb_pkce_';

/**
 * Discriminated callback outcome (03-04): a successful callback carries the
 * authorization code and state; a provider error callback carries the RFC
 * 6749 error code and its optional error_description verbatim; null means
 * the URL is not an OAuth callback at all. The three shapes are no longer
 * conflated — an access_denied redirect is observable as an error result,
 * not as a missing callback.
 */
export type CallbackResult =
  | { kind: 'callback'; code: string; state: string }
  | { kind: 'error'; error: string; error_description: string | null }
  | null;

export function handleCallback(): CallbackResult | null {
  const params = new URLSearchParams(window.location.search);

  const error = params.get('error');
  if (error) {
    return { kind: 'error', error, error_description: params.get('error_description') };
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return null;

  return { kind: 'callback', code, state };
}

export function savePendingState(pending: PendingAuthState): void {
  sessionStorage.setItem(`${PKCE_STORAGE_PREFIX}${pending.state}`, JSON.stringify(pending));
}

export function consumePendingState(state: string): PendingAuthState | null {
  const key = `${PKCE_STORAGE_PREFIX}${state}`;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;

  sessionStorage.removeItem(key);

  try {
    return JSON.parse(raw) as PendingAuthState;
  } catch {
    return null;
  }
}
