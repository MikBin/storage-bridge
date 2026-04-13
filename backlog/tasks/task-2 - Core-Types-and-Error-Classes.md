---
id: TASK-2
title: Core Types and Error Classes
status: To Do
assignee: []
created_date: '2026-04-13 15:40'
labels: []
dependencies:
  - TASK-1
references:
  - settings-store-architecture.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create packages/core with shared type definitions and error hierarchy. src/types.ts: ProviderId, Revision, SettingsEnvelope<T>, SettingsSummary, ConnectedProfile, PutOptions, SettingsStore interface, ProviderCapability, ProviderDescriptor. src/errors.ts: SettingsStoreError, NotConnectedError, UnsupportedProviderError, DocumentNotFoundError, ConflictError, AuthRequiredError, ProviderUnavailableError. src/index.ts re-exports all.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/types.ts exports all public types
- [ ] #2 src/errors.ts exports full error hierarchy
- [ ] #3 src/index.ts re-exports all public types and errors
- [ ] #4 Unit tests for error construction and instanceof checks
- [ ] #5 Package builds cleanly
<!-- AC:END -->
