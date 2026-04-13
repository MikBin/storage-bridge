---
id: TASK-7
title: Local Provider
status: To Do
assignee: []
created_date: '2026-04-13 15:41'
labels: []
dependencies:
  - TASK-3
references:
  - settings-store-architecture.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement packages/provider-local - an in-memory DocumentStoreProvider for offline fallback, development, and tests. Uses an in-memory Map. Generates revision strings on each put.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Implements DocumentStoreProvider with in-memory Map
- [ ] #2 connect/disconnect/isConnected/getProfile work correctly
- [ ] #3 getDocument/putDocument/deleteDocument/listDocuments work correctly
- [ ] #4 Generates revision strings on each put
- [ ] #5 Passes provider contract tests from packages/testing
<!-- AC:END -->
