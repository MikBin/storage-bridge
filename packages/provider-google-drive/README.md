# @storage-bridge/provider-google-drive

Google Drive (`appDataFolder`) file-backed storage provider for Storage
Bridge: implements the `DocumentStoreProvider` port over the Drive v3 API.

## Install

```sh
pnpm add @storage-bridge/provider-google-drive
```

## Usage

```ts
import { GoogleDriveProvider } from '@storage-bridge/provider-google-drive';

const provider = new GoogleDriveProvider({ auth }); // auth: OAuthClient from an auth package
await provider.connect();
```

See the [root README](../../README.md) for the full documentation.
