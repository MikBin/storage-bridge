---
id: TASK-11
title: Google Drive Provider
status: To Do
assignee: []
created_date: '2026-04-13 15:42'
labels: []
dependencies:
  - TASK-3
  - TASK-9
references:
  - settings-store-architecture.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement packages/provider-google-drive extending FileBackedDocumentProvider. Targets hidden appDataFolder with drive.appdata scope. Uses parents: ['appDataFolder'] for creation, spaces=appDataFolder for listing, files.get(?alt=media) for download. Multipart upload for create, PATCH for update.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extends FileBackedDocumentProvider
- [ ] #2 Uses appDataFolder with drive.appdata scope
- [ ] #3 Multipart upload for create, PATCH for update
- [ ] #4 Delegates auth to injected OAuthClient
- [ ] #5 google-drive-mapper.ts maps API responses to FileEntry
- [ ] #6 Passes provider contract tests
- [ ] #7 Unit tests with mocked fetch
<!-- AC:END -->
