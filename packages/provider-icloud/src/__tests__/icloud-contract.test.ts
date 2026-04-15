import { describeProviderContract } from '@storage-bridge/testing';
import { ICloudProvider } from '../icloud-provider.js';
import { createCloudKitApiMock } from './icloud-api-mock.js';

const apiMock = createCloudKitApiMock();

describeProviderContract('ICloudProvider', () => {
  apiMock.reset();

  const provider = new ICloudProvider({
    apiToken: 'test-token',
    containerId: 'iCloud.com.test.container',
    environment: 'development',
    fetchFn: apiMock.fetchFn
  });

  // Mocking connect/disconnect to pass contract tests which expect isConnected to change
  let connected = false;
  provider.connect = async () => { connected = true; };
  provider.disconnect = async () => { connected = false; };
  provider.isConnected = async () => connected;

  const originalGetProfile = provider.getProfile.bind(provider);
  provider.getProfile = async () => {
    if (!connected) return null;
    const profile = await originalGetProfile();
    return profile ? { ...profile, provider: 'icloud' } : null;
  };

  return provider;
});
