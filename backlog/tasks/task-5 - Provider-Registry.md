---
id: TASK-5
title: Provider Registry
status: To Do
assignee: []
created_date: '2026-04-13 15:41'
labels: []
dependencies:
  - TASK-4
references:
  - docs/settings-store-architecture.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement ProviderRegistry helper and convenience createSettingsStore(descriptors[]) factory function in src/registry.ts. Re-export from src/index.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/registry.ts helper to build Map<ProviderId, ProviderDescriptor>
- [ ] #2 createSettingsStore(descriptors[]) factory function
- [ ] #3 Unit tests for registration and lookup
- [ ] #4 Re-exported from src/index.ts
<!-- AC:END -->
