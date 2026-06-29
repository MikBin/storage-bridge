---
id: TASK-6
title: Core Integration Tests
status: Done
assignee: []
created_date: '2026-04-13 15:41'
updated_date: '2026-06-29 23:59'
labels: []
dependencies:
  - TASK-5
references:
  - docs/settings-store-architecture.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
End-to-end integration tests for core package exercising full SettingsStore -> DefaultSettingsStore -> fake provider pipeline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Integration test: register fake provider, connect, put/get/list/delete, disconnect
- [x] #2 Optimistic concurrency: put with expectedRevision triggers ConflictError on mismatch
- [x] #3 schemaVersion preservation across put/get cycles
- [x] #4 All core tests pass via turbo test --filter=core
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented via commit `bcfdf60`. Added comprehensive end-to-end integration tests in `packages/core/src/__tests__/integration.test.ts` that verify connection, basic CRUD, optimistic concurrency, and schemaVersion preservation using a mock provider.
<!-- SECTION:FINAL_SUMMARY:END -->

