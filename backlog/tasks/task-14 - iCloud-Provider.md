---
id: TASK-14
title: iCloud Provider
status: In Progress
assignee: []
created_date: '2026-04-13 15:43'
updated_date: '2026-04-15 17:34'
labels: []
dependencies:
  - TASK-3
references:
  - docs/settings-store-architecture.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement packages/provider-icloud extending RecordBackedDocumentProvider. Uses CloudKit for private-per-user cloud storage. Apple-only runtime constraint. src/cloudkit-client.ts: CloudKit JS/REST wrapper. src/record-mapper.ts: maps CloudKit records to CloudRecord.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extends RecordBackedDocumentProvider
- [ ] #2 cloudkit-client.ts wraps CloudKit JS SDK or REST API
- [ ] #3 record-mapper.ts maps CloudKit records to/from CloudRecord
- [ ] #4 Implements getRecord/saveRecord/removeRecord/listRecords
- [ ] #5 isSupported() returns false on non-Apple runtimes
- [ ] #6 Passes provider contract tests
- [ ] #7 Unit tests with mocked CloudKit client
<!-- AC:END -->
