# Provider Registry Design (TASK-5)

## Overview

Add a `ProviderRegistry` helper class and a `createSettingsStore()` factory function to `@storage-bridge/core`. These provide a clean, validated way to register provider descriptors and create a `SettingsStore` instance.

## API

### `ProviderRegistry` class

Located in `packages/core/src/registry.ts`.

```ts
export class ProviderRegistry {
  private readonly descriptors = new Map<ProviderId, ProviderDescriptor>();

  /** Register a provider descriptor. Throws if ID already registered. */
  register(descriptor: ProviderDescriptor): void;

  /** Remove a provider by ID. Returns true if it existed. */
  unregister(id: ProviderId): boolean;

  /** Check if a provider ID is registered. */
  has(id: ProviderId): boolean;

  /** Get a descriptor by ID, or undefined. */
  get(id: ProviderId): ProviderDescriptor | undefined;

  /** Get all registered descriptors. */
  getAll(): ProviderDescriptor[];

  /** Return the internal map for use by DefaultSettingsStore. */
  asMap(): Map<ProviderId, ProviderDescriptor>;
}
```

**Validation:**
- `register()` throws `UnsupportedProviderError` (reuse existing error) if a descriptor with the same `id` is already registered
- No other validation — `ProviderDescriptor` already has the shape from `types.ts`

### `createSettingsStore()` factory

```ts
/** Convenience factory: register descriptors and return a SettingsStore. */
export function createSettingsStore(descriptors: ProviderDescriptor[]): SettingsStore;
```

Implementation: creates a `ProviderRegistry`, registers each descriptor, returns `new DefaultSettingsStore(registry.asMap())`.

### Exports

Update `packages/core/src/index.ts` to export:
- `ProviderRegistry` (class)
- `createSettingsStore` (function)

## Tests

Located in `packages/core/src/__tests__/registry.test.ts`.

1. Register a descriptor → `has()` returns true, `get()` returns it
2. Register duplicate → throws error
3. Unregister → `has()` returns false
4. `getAll()` returns all registered descriptors
5. `asMap()` returns the underlying Map
6. `createSettingsStore([descriptor])` returns a SettingsStore instance
7. The created store can `connect()` with a registered provider (using `LocalDocumentStoreProvider` descriptor)

## Design Decisions

- **Moderate approach**: validation + convenience, no event system, no capability filtering (YAGNI)
- **Reuses existing types**: `ProviderDescriptor`, `ProviderId`, `UnsupportedProviderError`
- **Registry is separate from store**: consumers can build the registry manually or use the factory
- **No dependency injection framework**: plain constructor/function pattern matching existing code style