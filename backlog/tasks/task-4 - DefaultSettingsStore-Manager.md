---
id: TASK-4
title: DefaultSettingsStore Manager
status: To Do
assignee: []
created_date: '2026-04-13 15:41'
labels: []
dependencies:
  - TASK-3
references:
  - docs/settings-store-architecture.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement DefaultSettingsStore - the main consumer-facing class that delegates to a connected DocumentStoreProvider. connect(provider) looks up registry, checks isSupported(), creates provider, calls connect(). disconnect() clears current. get/put/delete/list delegate to current provider; throw NotConnectedError if none. put merges existing schemaVersion and revision into envelope before calling putDocument.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 DefaultSettingsStore implements SettingsStore interface
- [ ] #2 connect/disconnect lifecycle works correctly
- [ ] #3 CRUD operations delegate to current provider
- [ ] #4 NotConnectedError thrown when no provider connected
- [ ] #5 UnsupportedProviderError and ProviderUnavailableError handled
- [ ] #6 Unit tests with fake provider
<!-- AC:END -->
