# @storage-bridge/testing

Test doubles and provider contract-test suites for Storage Bridge: a fake
`DocumentStoreProvider`, fixture factories, and `describeProviderContract`
to prove a provider satisfies the shared port contract.

## Install

```sh
pnpm add -D @storage-bridge/testing
```

## Usage

```ts
import { FakeDocumentStoreProvider, createSettingsEnvelope } from '@storage-bridge/testing';

const provider = new FakeDocumentStoreProvider();
const envelope = createSettingsEnvelope({ theme: 'dark' });
```

See the [root README](../../README.md) for the full documentation.
