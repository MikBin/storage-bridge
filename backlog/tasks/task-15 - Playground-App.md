---
id: TASK-15
title: Playground App
status: To Do
assignee: []
created_date: '2026-04-13 15:43'
labels: []
dependencies:
  - TASK-4
  - TASK-7
references:
  - docs/settings-store-architecture.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create apps/playground - a minimal web app for interactively testing the settings store with different providers. Simple UI to select provider, connect, and perform CRUD on settings documents.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 UI to select provider, connect, and perform CRUD
- [ ] #2 Displays connection status, profile info, and document list
- [ ] #3 Works with local provider out of the box
- [ ] #4 Runs via turbo dev --filter=playground
<!-- AC:END -->
