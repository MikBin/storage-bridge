/**
 * Generate a cryptographically random code verifier (43 chars, RFC 7636).
 * 32 random bytes → base64url-encoded = 43 characters.
 */
export async function generateCodeVerifier(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

/**
 * Generate S256 code challenge from a verifier.
 * SHA-256 hash of verifier → base64url-encoded.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(new Uint8Array(hash));
}

function base64urlEncode(buffer: Uint8Array): string {
  const binary = Array.from(buffer)
    .map(b => String.fromCharCode(b))
    .join('');
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
