---
id: TASK-11
title: Google Drive Provider
status: Done
assignee: []
created_date: '2026-04-13 15:42'
updated_date: '2026-04-15 16:56'
labels: []
dependencies:
  - TASK-3
  - TASK-9
references:
  - docs/settings-store-architecture.md
  - docs/superpowers/specs/2026-04-14-google-drive-provider-design.md
  - docs/superpowers/plans/2026-04-14-google-drive-provider.md
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Google Drive Provider Implementation

## 8 Tasks, 24 Steps

1. **Package Scaffold** — package.json, tsconfig, vitest config
2. **Mapper Tests** — failing tests for toFileEntry()
3. **Mapper Implementation** — GoogleDriveFileRaw type + toFileEntry()
4. **Drive API Mock** — shared mock for unit + contract tests
5. **Provider Tests** — failing tests for GoogleDriveProvider
6. **Provider Implementation** — extends FileBackedDocumentProvider
7. **Contract Tests** — describeProviderContract against mock
8. **Barrel Export + Verification** — index.ts, full test suite, typecheck
<!-- SECTION:PLAN:END -->
