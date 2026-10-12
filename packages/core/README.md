# @storage-bridge/core

Client-side settings store core for Storage Bridge: the document registry,
the `DocumentStoreProvider` port every provider implements, and OAuth token
management (`TokenManager`) shared by the auth adapters.

## Install

```sh
pnpm add @storage-bridge/core
```

## Usage

```ts
import { createSettingsStore, LocalDocumentStoreProvider } from '@storage-bridge/core';

const store = createSettingsStore([
  {
    id: 'local',
    label: 'Local file',
    capabilities: ['offline-cache'],
    isSupported: async () => true,
    create: () => new LocalDocumentStoreProvider(),
  },
]);

await store.connect('local');
```

See the [root README](../../README.md) for the full documentation.
