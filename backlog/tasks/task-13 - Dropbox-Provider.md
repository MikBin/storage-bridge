---
id: TASK-13
title: Dropbox Provider
status: To Do
assignee: []
created_date: '2026-04-13 15:42'
labels: []
dependencies:
  - TASK-3
  - TASK-9
references:
  - docs/settings-store-architecture.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement packages/provider-dropbox extending FileBackedDocumentProvider. Uses Dropbox App Folder access with PKCE. Read via POST /2/files/download with Dropbox-API-Arg header (null on 409). Write via POST /2/files/upload with mode: overwrite. Delete via POST /2/files/delete_v2. List via POST /2/files/list_folder filtering to file entries.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extends FileBackedDocumentProvider
- [ ] #2 Read via /2/files/download with Dropbox-API-Arg header
- [ ] #3 Write via /2/files/upload with mode: overwrite
- [ ] #4 Delete via /2/files/delete_v2
- [ ] #5 List via /2/files/list_folder filtering to file entries
- [ ] #6 Parses metadata from Dropbox-API-Result response header
- [ ] #7 Passes provider contract tests
- [ ] #8 Unit tests with mocked fetch
<!-- AC:END -->
