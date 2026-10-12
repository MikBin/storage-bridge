import { describe, it, expect } from 'vitest';
import {
  SettingsStoreError,
  NotConnectedError,
  UnsupportedProviderError,
  ConflictError,
  AuthRequiredError,
  ProviderUnavailableError,
} from '../errors.js';
import * as errorModule from '../errors.js';

describe('Errors', () => {
  describe('taxonomy hygiene (02-06)', () => {
    it('no longer exports DocumentNotFoundError — it was dead taxonomy', () => {
      expect(
        (errorModule as { DocumentNotFoundError?: unknown }).DocumentNotFoundError,
      ).toBeUndefined();
    });
  });

  describe('AuthExchangeError (02-06)', () => {
    it('constructs with provider and cause, coded AUTH_EXCHANGE', async () => {
      // Dynamic import so a missing export fails this assertion (semantic RED),
      // not the module graph (collection error).
      const { AuthExchangeError } = (await import('../errors.js')) as typeof errorModule;
      expect(AuthExchangeError).toBeTypeOf('function');

      const cause = new Error('HTTP 503: upstream unavailable');
      const err = new AuthExchangeError('google-drive', cause);
      expect(err).toBeInstanceOf(SettingsStoreError);
      expect(err).toBeInstanceOf(AuthExchangeError);
      expect(err.message).toBe('Token exchange failed for google-drive');
      expect(err.code).toBe('AUTH_EXCHANGE');
      expect(err.name).toBe('AuthExchangeError');
      expect(err.cause).toBe(cause);
    });
  });

  describe('SettingsStoreError', () => {
    it('constructs properly', () => {
      const err = new SettingsStoreError('test message', 'TEST_CODE');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(SettingsStoreError);
      expect(err.message).toBe('test message');
      expect(err.code).toBe('TEST_CODE');
      expect(err.name).toBe('SettingsStoreError');
      expect(err.cause).toBeUndefined();
    });

    it('handles cause', () => {
      const cause = new Error('root cause');
      const err = new SettingsStoreError('test message', 'TEST_CODE', cause);
      expect(err.cause).toBe(cause);
    });
  });

  describe('NotConnectedError', () => {
    it('constructs properly', () => {
      const err = new NotConnectedError();
      expect(err).toBeInstanceOf(SettingsStoreError);
      expect(err).toBeInstanceOf(NotConnectedError);
      expect(err.message).toBe('No provider connected');
      expect(err.code).toBe('NOT_CONNECTED');
      expect(err.name).toBe('NotConnectedError');
    });
  });

  describe('UnsupportedProviderError', () => {
    it('constructs properly', () => {
      const err = new UnsupportedProviderError('xyz');
      expect(err).toBeInstanceOf(SettingsStoreError);
      expect(err).toBeInstanceOf(UnsupportedProviderError);
      expect(err.message).toBe('Unsupported provider: xyz');
      expect(err.code).toBe('UNSUPPORTED_PROVIDER');
      expect(err.name).toBe('UnsupportedProviderError');
    });
  });

  describe('ConflictError', () => {
    it('constructs properly', () => {
      const err = new ConflictError('doc2');
      expect(err).toBeInstanceOf(SettingsStoreError);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.message).toBe('Revision conflict for: doc2');
      expect(err.code).toBe('CONFLICT');
      expect(err.name).toBe('ConflictError');
    });
  });

  describe('AuthRequiredError', () => {
    it('constructs properly', () => {
      const err = new AuthRequiredError('google-drive');
      expect(err).toBeInstanceOf(SettingsStoreError);
      expect(err).toBeInstanceOf(AuthRequiredError);
      expect(err.message).toBe('Authentication required for google-drive');
      expect(err.code).toBe('AUTH_REQUIRED');
      expect(err.name).toBe('AuthRequiredError');
    });
  });

  describe('ProviderUnavailableError', () => {
    it('constructs properly', () => {
      const err = new ProviderUnavailableError('icloud');
      expect(err).toBeInstanceOf(SettingsStoreError);
      expect(err).toBeInstanceOf(ProviderUnavailableError);
      expect(err.message).toBe('Provider unavailable on this runtime: icloud');
      expect(err.code).toBe('PROVIDER_UNAVAILABLE');
      expect(err.name).toBe('ProviderUnavailableError');
    });
  });
});
