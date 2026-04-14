---
id: TASK-2
title: Core Types and Error Classes
status: Done
assignee: []
created_date: '2026-04-13 15:40'
labels: []
dependencies:
  - TASK-1
references:
  - docs/settings-store-architecture.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create packages/core with shared type definitions and error hierarchy. src/types.ts: ProviderId, Revision, SettingsEnvelope<T>, SettingsSummary, ConnectedProfile, PutOptions, SettingsStore interface, ProviderCapability, ProviderDescriptor. src/errors.ts: SettingsStoreError, NotConnectedError, UnsupportedProviderError, DocumentNotFoundError, ConflictError, AuthRequiredError, ProviderUnavailableError. src/index.ts re-exports all.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src/types.ts exports all public types
- [x] #2 src/errors.ts exports full error hierarchy
- [x] #3 src/index.ts re-exports all public types and errors
- [x] #4 Unit tests for error construction and instanceof checks
- [x] #5 Package builds cleanly
<!-- AC:END -->
