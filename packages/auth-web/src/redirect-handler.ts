import type { PendingAuthState } from './types.js';

const PKCE_STORAGE_PREFIX = 'sb_pkce_';

export interface CallbackResult {
  success: true;
  code: string;
  state: string;
}

export function handleCallback(): CallbackResult | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (!code || !state) return null;

  return { success: true, code, state };
}

export function savePendingState(pending: PendingAuthState): void {
  sessionStorage.setItem(
    `${PKCE_STORAGE_PREFIX}${pending.state}`,
    JSON.stringify(pending),
  );
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
