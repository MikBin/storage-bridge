---
id: TASK-8
title: Testing Package and Provider Contract Tests
status: To Do
assignee: []
created_date: '2026-04-13 15:41'
labels: []
dependencies:
  - TASK-2
references:
  - docs/settings-store-architecture.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create packages/testing with reusable test utilities and a provider conformance test suite that validates any DocumentStoreProvider implementation. src/fixtures.ts: factory functions. src/fake-provider.ts: in-memory provider for consumer tests. src/provider-contract-tests.ts: exported describeProviderContract(factory) suite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/fixtures.ts with factory functions for SettingsEnvelope, SettingsSummary, ConnectedProfile
- [ ] #2 src/fake-provider.ts with simple in-memory DocumentStoreProvider
- [ ] #3 src/provider-contract-tests.ts with exported conformance test suite
- [ ] #4 Contract tests validate: connect/disconnect, put/get round-trip, list, delete, null on missing, revision updates
- [ ] #5 Package builds cleanly
<!-- AC:END -->
