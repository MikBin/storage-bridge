---
id: TASK-13
title: Dropbox Provider
status: Done
assignee: []
created_date: '2026-04-13 15:42'
updated_date: '2026-06-29 23:59'
labels: []
dependencies:
  - TASK-3
  - TASK-9
references:
  - docs/settings-store-architecture.md
  - docs/superpowers/specs/2026-04-15-dropbox-provider-design.md
  - docs/superpowers/plans/2026-04-15-dropbox-provider.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement packages/provider-dropbox extending FileBackedDocumentProvider. Uses Dropbox App Folder access with PKCE. Read via POST /2/files/download with Dropbox-API-Arg header (null on 409). Write via POST /2/files/upload with mode: overwrite. Delete via POST /2/files/delete_v2. List via POST /2/files/list_folder filtering to file entries.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Extends FileBackedDocumentProvider
- [x] #2 Read via /2/files/download with Dropbox-API-Arg header
- [x] #3 Write via /2/files/upload with mode: overwrite
- [x] #4 Delete via /2/files/delete_v2
- [x] #5 List via /2/files/list_folder filtering to file entries
- [x] #6 Parses metadata from Dropbox-API-Result response header
- [x] #7 Passes provider contract tests
- [x] #8 Unit tests with mocked fetch
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented via commit `15416ef`. The Dropbox Provider package extends FileBackedDocumentProvider, utilizes the Dropbox API endpoints (/2/files/download, /2/files/upload, /2/files/delete_v2, /2/files/list_folder), parses metadata headers, and passes both contract and mock-fetch tests.
<!-- SECTION:FINAL_SUMMARY:END -->

