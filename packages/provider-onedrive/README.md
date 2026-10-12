# @storage-bridge/provider-onedrive

Microsoft OneDrive (`approot`) file-backed storage provider for Storage
Bridge: implements the `DocumentStoreProvider` port over the Graph API.

## Install

```sh
pnpm add @storage-bridge/provider-onedrive
```

## Usage

```ts
import { OneDriveProvider } from '@storage-bridge/provider-onedrive';

const provider = new OneDriveProvider({ auth }); // auth: OAuthClient from an auth package
await provider.connect();
```

See the [root README](../../README.md) for the full documentation.
