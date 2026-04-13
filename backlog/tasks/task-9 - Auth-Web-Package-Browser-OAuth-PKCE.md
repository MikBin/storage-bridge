---
id: TASK-9
title: Auth Web Package (Browser OAuth PKCE)
status: To Do
assignee: []
created_date: '2026-04-13 15:42'
labels: []
dependencies:
  - TASK-2
references:
  - settings-store-architecture.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement packages/auth-web with browser-based OAuth PKCE helpers satisfying the OAuthClient interface. src/oauth-client.ts: browser OAuthClient. src/pkce.ts: PKCE code verifier/challenge via Web Crypto API. src/redirect-handler.ts: OAuth redirect callback. src/token-store.ts: OAuthTokens in localStorage/sessionStorage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Browser OAuthClient implementation
- [ ] #2 PKCE code verifier/challenge generation using Web Crypto API
- [ ] #3 OAuth redirect callback handler
- [ ] #4 Token storage in localStorage or sessionStorage
- [ ] #5 login() initiates PKCE auth flow via redirect
- [ ] #6 getAccessToken() returns valid token with auto-refresh
- [ ] #7 getAuthHeaders() returns Bearer authorization header
- [ ] #8 Unit tests for PKCE, token storage, and refresh logic
<!-- AC:END -->
