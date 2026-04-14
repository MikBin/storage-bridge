import type { PendingAuthState } from './types.js';

const PKCE_STORAGE_PREFIX = 'sb_pkce_';

/**
 * Result of handling the OAuth callback.
 */
export interface CallbackResult {
  success: true;
  code: string;
  state: string;
}

/**
 * Handle the OAuth redirect callback on page load.
 * Call this in your app's entry point when the URL contains auth response params.
 *
 * @returns CallbackResult if this is an auth callback, null otherwise
 */
export function handleCallback(): CallbackResult | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (!code || !state) return null;

  return { success: true, code, state };
}

/**
 * Persist PKCE state before redirecting.
 * Stored in sessionStorage so it survives the page redirect.
 */
export function savePendingState(pending: PendingAuthState): void {
  sessionStorage.setItem(
    `${PKCE_STORAGE_PREFIX}${pending.state}`,
    JSON.stringify(pending),
  );
}

/**
 * Retrieve and clear PKCE state after callback.
 * Validates the state parameter matches before returning.
 */
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
