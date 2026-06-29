# Storage Bridge - Production Readiness Todo List

This file tracks the outstanding tasks required to bring the Storage Bridge project to a production-ready state.

## 1. Backlog Synchronization
- [x] Update status to `Done` in backlog task files
- [x] Move completed tasks from [tasks](file:///c:/Users/miche/Documents/projects/storage-bridge/backlog/tasks) to [completed](file:///c:/Users/miche/Documents/projects/storage-bridge/backlog/completed)
  - Tasks: 3, 5, 6, 8, 9, 10, 11, 12, 13, 14

## 2. Missing Features & Documentation
- [ ] Implement interactive playground app (`TASK-15`) in `apps/playground`
  - Allows manual verification of CRUD settings across providers
- [ ] Build end-to-end usage example apps (`TASK-16`)
  - [ ] React SPA web example with Google Drive and OneDrive
  - [ ] React Native mobile example with OAuth flow
  - [ ] Capacitor hybrid example
- [ ] Compile API references from TSDoc comments (`apps/docs`)

## 3. Code Quality & Type Safety (Address ANY_USAGE_REPORT.md)
- [ ] Eliminate `any` casts in tests by changing provider methods to `public`
  - Refactor `listFiles`, `readFile`, `writeFile`, and `removeFile`
- [ ] Type external API boundaries with formal DTO structures (e.g., CloudKit client)
- [ ] Replace remaining instances of `any` with `unknown` or explicit types

## 4. DevOps & Release Engineering
- [ ] Build CI/CD pipeline (e.g., GitHub Actions) to automate:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- [ ] Verify ESM/CJS build outputs and export mappings in package configurations
- [ ] Perform integration tests against live cloud provider sandboxes
