---
id: TASK-17
title: Conflict Resolution and Sync Merge Strategy
status: To Do
assignee: []
created_date: '2026-08-19 13:28'
labels:
  - architecture
  - sync
  - concurrency
dependencies:
  - TASK-4
references:
  - docs/settings-store-architecture.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement conflict resolution and synchronization strategies to eliminate data loss and "sync nightmares" when multiple clients or offline devices update settings concurrently.

### Problem Statement
Currently, Storage Bridge implements whole-document Optimistic Concurrency Control (OCC) with `expectedRevision`. If `expectedRevision` is omitted, the provider executes a blind Last-Write-Wins (LWW) overwrite of the full JSON document, silently erasing field-level changes made by concurrent clients. If `expectedRevision` is provided, a `ConflictError` is thrown, forcing consumer applications to manually implement re-fetching, parsing, and custom three-way reconciliation.

### Analysis & Solution Strategies
1. **Strategy A (Recommended): Transparent 3-Way Auto-Merge in `DefaultSettingsStore`**
   - Add merge options to `store.put(key, data, { mergeStrategy: 'deep-merge' | resolverFn, maxRetries: 3 })`.
   - On `ConflictError`, automatically re-fetch the latest remote document revision, perform a property-level 3-way merge against the base state, and retry the update with the new revision.

2. **Strategy B: Timestamped Field-Level LWW Map (Lightweight CRDT)**
   - Maintain per-property logical clocks or timestamps within the document envelope.
   - Deterministically merge concurrent property edits without requiring full-document replacement.

3. **Strategy C: Pluggable State-Based CRDT Adapter**
   - Enable `SettingsEnvelope<Uint8Array>` to store and sync Automerge or Yjs binary documents for collaborative state structures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Design and document the formal conflict resolution API in `docs/settings-store-architecture.md`
- [ ] #2 Implement automatic 3-way merge resolver in `DefaultSettingsStore.put()` with configurable merge strategies (`'overwrite'`, `'deep-merge'`, or custom resolver function)
- [ ] #3 Implement automatic retry-on-conflict loop with backoff in `DefaultSettingsStore`
- [ ] #4 Add comprehensive unit tests and property-based tests for concurrent multi-device merge scenarios
- [ ] #5 Update documentation and playground app to demonstrate automatic conflict resolution
<!-- AC:END -->
