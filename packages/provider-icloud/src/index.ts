export { ICloudProvider, type ICloudProviderOptions } from './icloud-provider.js';
export {
  DEFAULT_RECORD_TYPE,
  isAppleRuntime,
  isNotFoundFailure,
  mapCloudKitError,
  type CloudKitClient,
  type CloudKitClientConfig,
  type CloudKitField,
  type CloudKitRecordRaw,
} from './cloudkit-client.js';
export { CloudKitJsClient, type CloudKitJsClientOptions } from './cloudkit-js-client.js';
export { mapFromCloudRecord, mapToCloudRecord } from './record-mapper.js';
