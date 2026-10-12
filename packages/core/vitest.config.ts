import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Workspace-source aliases. Core's test tree hosts the local provider's
 * contract harness, but a devDependency on @storage-bridge/testing would
 * create a circular package graph (testing -> core) that turbo rejects.
 *
 * Running the shared suite and the provider under test from SOURCE keeps a
 * single copy of the error classes in flight, so the suite's instanceof
 * assertions (rejects.toThrow(NotConnectedError) etc.) compare identical
 * classes. At compile time `@storage-bridge/testing` resolves through the
 * tsconfig `paths` mapping to testing's built declaration files.
 */
const resolveFromConfig = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@storage-bridge/testing': resolveFromConfig('../testing/src/index.ts'),
      '@storage-bridge/core': resolveFromConfig('./src/index.ts'),
    },
  },
});
