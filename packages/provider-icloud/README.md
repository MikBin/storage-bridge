# @storage-bridge/provider-icloud

iCloud (CloudKit private database) record-backed storage provider for
Storage Bridge: implements the `DocumentStoreProvider` port over CloudKit.

## Install

```sh
pnpm add @storage-bridge/provider-icloud
```

## Usage

```ts
import { ICloudProvider } from '@storage-bridge/provider-icloud';

const provider = new ICloudProvider({
  config: { containerIdentifier: 'iCloud.com.example.app', environment: 'production' },
  apiToken: 'your-cloudkit-web-token',
});
await provider.connect();
```

See the [root README](../../README.md) for the full documentation.
