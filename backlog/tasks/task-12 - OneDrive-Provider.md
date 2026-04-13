---
id: TASK-12
title: OneDrive Provider
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
Implement packages/provider-onedrive extending FileBackedDocumentProvider. Uses Microsoft Graph /special/approot endpoint with Files.ReadWrite.AppFolder permission. Read: GET content, Write: PUT content, Delete: DELETE, List: GET children. Returns null on 404 for read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extends FileBackedDocumentProvider
- [ ] #2 Uses /me/drive/special/approot endpoints
- [ ] #3 Returns null on 404 for read (not an error)
- [ ] #4 Delegates auth to injected OAuthClient
- [ ] #5 Passes provider contract tests
- [ ] #6 Unit tests with mocked fetch
<!-- AC:END -->
