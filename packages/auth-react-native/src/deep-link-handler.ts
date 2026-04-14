export function parseCallbackUrl(url: string): { code: string; state: string } | null {
  if (!url) return null;

  try {
    const parseable = url.includes('://') ? `http${url.substring(url.indexOf('://'))}` : url;
    const parsed = new URL(parseable);
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');

    if (!code || !state) return null;

    return { code, state };
  } catch {
    return null;
  }
}

export function buildRedirectUri(scheme: string, path: string = 'oauth/callback'): string {
  const cleanScheme = scheme.replace(/:$/, '');
  return `${cleanScheme}://${path}`;
}
