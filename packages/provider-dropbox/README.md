# @storage-bridge/provider-dropbox

Dropbox (`/Apps` folder) file-backed storage provider for Storage Bridge:
implements the `DocumentStoreProvider` port over the Dropbox HTTP API.

## Install

```sh
pnpm add @storage-bridge/provider-dropbox
```

## Usage

```ts
import { DropboxProvider } from '@storage-bridge/provider-dropbox';

const provider = new DropboxProvider({ auth }); // auth: OAuthClient from an auth package
await provider.connect();
```

See the [root README](../../README.md) for the full documentation.
