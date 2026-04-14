# Monorepo Scaffold Design

**Task:** TASK-1 — Monorepo Scaffold
**Date:** 2026-04-14
**Status:** Draft

## Overview

Initialize the Storage Bridge project as a pnpm monorepo with Turborepo build orchestration. This is the foundation task — everything else in the project depends on this structure being correct.

## Target Structure

```
storage-bridge/
├── package.json              # root workspace config
├── pnpm-workspace.yaml       # pnpm workspace definitions
├── turbo.json                # Turborepo pipeline config
├── tsconfig.base.json        # shared TS compiler options
├── .gitignore                # updated
├── packages/
│   ├── core/                 # (TASK-2: shared types, errors, interfaces)
│   ├── eslint-config/        # shared ESLint flat config
│   └── typescript-config/    # shared tsconfig presets
├── apps/
│   └── playground/           # (TASK-15: interactive test app)
└── examples/                 # (TASK-16: usage examples)
```

## Design Decisions

### 1. ESLint Flat Config (v9+)

**Choice:** Flat config (`eslint.config.js` style exported from `index.js`).

**Rationale:** Greenfield project in 2026. Flat config is the ESLint standard. Legacy `.eslintrc` format is deprecated. The exported config will use `typescript-eslint` for TypeScript support.

### 2. Shared TypeScript Config Package

**Choice:** Add `packages/typescript-config/` with reusable tsconfig presets.

**Rationale:** Standard Turborepo pattern. Avoids every package duplicating compiler options. `tsconfig.base.json` at root defines the base; `packages/typescript-config/base.json` extends it and is referenced by all packages. Additional presets (e.g., `react.json`) can be added later for the playground app.

### 3. Workspace Definition

**Choice:** Both `pnpm-workspace.yaml` (required by pnpm) and explicit workspace packages.

pnpm requires `pnpm-workspace.yaml` to define workspace packages. The `package.json` `workspaces` field is a npm/yarn concept — pnpm reads from `pnpm-workspace.yaml`.

### 4. Turborepo Pipelines

Pipelines defined in `turbo.json`:

| Pipeline | `dependsOn` | Outputs | Notes |
|----------|-------------|---------|-------|
| `build` | `^build` | `dist/**` | Topological build order |
| `test` | `build` | — | Runs after build; per-package tests |
| `lint` | — | — | ESLint per package |
| `typecheck` | — | — | `tsc --noEmit` per package |
| `dev` | — | — | Persistent dev servers (playground) |

### 5. Test Framework

**Choice:** Define the `test` pipeline entry but defer test runner setup to TASK-2/TASK-8.

No test framework is configured at this stage. The pipeline exists so packages can opt in. Vitest will likely be added in TASK-2 (core) or TASK-8 (testing package).

### 6. Node Version & Engine Constraints

**Choice:** Node >= 18 (LTS). Specified via `engines` field in root `package.json`.

## Files to Create/Modify

### `package.json` (create)

- Name: `storage-bridge`
- Private: true
- Workspaces defined in `pnpm-workspace.yaml` (not here)
- DevDependencies: `turbo`, `typescript`
- Scripts: `build`, `test`, `lint`, `typecheck`, `dev` (all delegating to turbo)
- Engines: `node >= 18`

### `pnpm-workspace.yaml` (create)

```yaml
packages:
  - "packages/*"
  - "apps/*"
  - "examples/*"
```

### `turbo.json` (create)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### `tsconfig.base.json` (create)

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### `.gitignore` (modify)

Add entries:
- `.turbo/` — Turborepo cache
- Ensure `dist` and `node_modules/` are present (already covered)

### `packages/eslint-config/` (create)

Shared ESLint flat config:
- `package.json` — name: `@storage-bridge/eslint-config`, deps: `eslint`, `typescript-eslint`
- `index.js` — exports flat config array with TypeScript plugin

### `packages/typescript-config/` (create)

Shared tsconfig presets:
- `package.json` — name: `@storage-bridge/typescript-config`
- `base.json` — extends root `tsconfig.base.json`, adds `outDir` and `rootDir` defaults

## Acceptance Criteria Mapping

| AC | How Satisfied |
|----|--------------|
| #1 package.json workspaces defines packages/*, apps/*, examples/* | `pnpm-workspace.yaml` lists all three |
| #2 tsconfig.base.json with strict, ES2022, moduleResolution bundler | Created with exact settings |
| #3 turbo.json with build, test, lint, typecheck pipelines | All four pipelines + dev |
| #4 .gitignore updated for node_modules, dist, turbo cache | `.turbo/` added; `node_modules/` and `dist` already present |
| #5 packages/eslint-config/index.js with shared lint config | Flat config with TypeScript support |
| #6 pnpm install and turbo build run cleanly | Verified by running both commands |

## Out of Scope

- Package source code (TASK-2+)
- Test framework setup (TASK-2/TASK-8)
- CI/CD configuration
- Playground app (TASK-15)
- Example apps (TASK-16)