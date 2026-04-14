export class SettingsStoreError extends Error {
  constructor(message: string, public readonly code: string, public readonly cause?: unknown) {
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

export class DocumentNotFoundError extends SettingsStoreError {
  constructor(key: string) {
    super(`Document not found: ${key}`, 'DOCUMENT_NOT_FOUND');
    this.name = 'DocumentNotFoundError';
  }
}

export class ConflictError extends SettingsStoreError {
  constructor(key: string) {
    super(`Revision conflict for: ${key}`, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class AuthRequiredError extends SettingsStoreError {
  constructor(provider: string) {
    super(`Authentication required for ${provider}`, 'AUTH_REQUIRED');
    this.name = 'AuthRequiredError';
  }
}

export class ProviderUnavailableError extends SettingsStoreError {
  constructor(provider: string) {
    super(`Provider unavailable on this runtime: ${provider}`, 'PROVIDER_UNAVAILABLE');
    this.name = 'ProviderUnavailableError';
  }
}
