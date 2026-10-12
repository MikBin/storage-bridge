import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // `_`-prefixed args/vars are the project's intentional-ignore convention
      // (e.g. fake implementations that must satisfy an abstract signature).
      // Genuinely unused declarations remain errors.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Type-only imports keep the D4 type-only boundary explicit: value
      // imports stay runtime-visible, `import type` disappears at compile time.
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  {
    // Documented rule scope (step 01-02): test scaffolds (01-01) deliberately
    // use `any` casts to exercise protected provider internals from black-box
    // tests and to type generic in-memory fakes (e.g. SettingsEnvelope<any>,
    // `{} as any` descriptors). Production sources keep the rule at "error".
    files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
