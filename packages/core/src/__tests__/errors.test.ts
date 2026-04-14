import { describe, it, expect } from 'vitest';
import {
  SettingsStoreError,
  NotConnectedError,
  UnsupportedProviderError,
  DocumentNotFoundError,
  ConflictError,
  AuthRequiredError,
  ProviderUnavailableError,
} from '../errors.js';

describe('Errors', () => {
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

  describe('DocumentNotFoundError', () => {
    it('constructs properly', () => {
      const err = new DocumentNotFoundError('doc1');
      expect(err).toBeInstanceOf(SettingsStoreError);
      expect(err).toBeInstanceOf(DocumentNotFoundError);
      expect(err.message).toBe('Document not found: doc1');
      expect(err.code).toBe('DOCUMENT_NOT_FOUND');
      expect(err.name).toBe('DocumentNotFoundError');
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
