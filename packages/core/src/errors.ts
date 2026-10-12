export class SettingsStoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SettingsStoreError';
  }
}

export class NotConnectedError extends SettingsStoreError {
  constructor() {
    super('No provider connected', 'NOT_CONNECTED');
    this.name = 'NotConnectedError';
  }
}

export class UnsupportedProviderError extends SettingsStoreError {
  constructor(provider: string) {
    super(`Unsupported provider: ${provider}`, 'UNSUPPORTED_PROVIDER');
    this.name = 'UnsupportedProviderError';
  }
}

export class AuthRequiredError extends SettingsStoreError {
  constructor(provider: string) {
    super(`Authentication required for ${provider}`, 'AUTH_REQUIRED');
    this.name = 'AuthRequiredError';
  }
}

/**
 * A token-endpoint transport or server failure (network error, 5xx, unexpected
 * status): the grant itself is NOT known to be dead, so this is distinct from
 * AuthRequiredError and must not request re-authentication. The underlying
 * failure (network error, or an Error carrying the HTTP status and body
 * excerpt) is chained as cause.
 */
export class AuthExchangeError extends SettingsStoreError {
  constructor(provider: string, cause?: unknown) {
    super(`Token exchange failed for ${provider}`, 'AUTH_EXCHANGE', cause);
    this.name = 'AuthExchangeError';
  }
}

export class ConflictError extends SettingsStoreError {
  /**
   * The logical (unencoded) document key the caller used — the payload
   * surface consumers match conflicts against (provider contract family
   * 'conflict-payload'). Encoded storage filenames never leak to callers.
   */
  constructor(public readonly key: string) {
    super(`Revision conflict for: ${key}`, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class ProviderUnavailableError extends SettingsStoreError {
  constructor(provider: string) {
    super(`Provider unavailable on this runtime: ${provider}`, 'PROVIDER_UNAVAILABLE');
    this.name = 'ProviderUnavailableError';
  }
}
