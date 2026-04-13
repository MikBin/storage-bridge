---
id: TASK-6
title: Core Integration Tests
status: To Do
assignee: []
created_date: '2026-04-13 15:41'
labels: []
dependencies:
  - TASK-5
references:
  - settings-store-architecture.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
End-to-end integration tests for core package exercising full SettingsStore -> DefaultSettingsStore -> fake provider pipeline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Integration test: register fake provider, connect, put/get/list/delete, disconnect
- [ ] #2 Optimistic concurrency: put with expectedRevision triggers ConflictError on mismatch
- [ ] #3 schemaVersion preservation across put/get cycles
- [ ] #4 All core tests pass via turbo test --filter=core
<!-- AC:END -->
