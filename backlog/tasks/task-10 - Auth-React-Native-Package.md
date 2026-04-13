---
id: TASK-10
title: Auth React Native Package
status: To Do
assignee: []
created_date: '2026-04-13 15:42'
labels: []
dependencies:
  - TASK-2
references:
  - settings-store-architecture.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement packages/auth-react-native with native/hybrid auth glue. src/oauth-client.ts: React Native OAuthClient using expo-auth-session or react-native-app-auth. src/deep-link-handler.ts: OAuth deep link callbacks. src/secure-token-store.ts: secure storage via expo-secure-store or react-native-keychain.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 React Native OAuthClient implementation
- [ ] #2 Deep link handler for OAuth callbacks
- [ ] #3 Secure token storage
- [ ] #4 login/logout/getAccessToken/getAuthHeaders work on iOS and Android
- [ ] #5 Unit tests for token storage and deep link parsing
<!-- AC:END -->
