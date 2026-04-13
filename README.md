# Storage Bridge

A client-side TypeScript library that stores per-user app settings in the user's own cloud account — with a single, transparent API across **Google Drive**, **Dropbox**, **OneDrive**, and **iCloud**.

## Why

Apps shouldn't need their own backend just to persist user preferences. Storage Bridge gives you a document-oriented settings store that works the same way regardless of which cloud provider the user connects.

## Key Features

- **Provider-agnostic API** — consumer code never touches provider-specific SDKs
- **Document-oriented** — keyed JSON documents, not a generic filesystem abstraction
- **Least-privilege storage** — uses app-scoped folders/containers where providers support them
- **Optimistic concurrency** — revision-based conflict detection
- **Multi-platform** — browser, React Native, and hybrid (Capacitor/etc.)
- **Extensible** — add new providers without changing the consumer API

## Supported Providers

| Provider | Storage Model | Scope |
|----------|--------------|-------|
| Google Drive | `appDataFolder` | App-only |
| Dropbox | App Folder | App-only |
| OneDrive | `/special/approot` | App-only |
| iCloud | CloudKit private database | Per-user |
| Local | In-memory / localStorage | Fallback |

## Quick Example

```ts
import { DefaultSettingsStore } from '@storage-bridge/core';

const store = new DefaultSettingsStore(registry);

await store.connect('google-drive');

await store.put('preferences', { theme: 'dark', locale: 'en' });
const prefs = await store.get('preferences');
```

## Architecture

See [settings-store-architecture.md](./settings-store-architecture.md) for the full design — public API, provider port, error model, auth abstraction, and monorepo structure.

## License

[MIT](./LICENSE)
