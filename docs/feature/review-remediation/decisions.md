# Review-Remediation Decisions

Date: 2026-10-12
Status: Approved by user (all five set to the recommended option)

Source: tri-review of 2026-10-12 (nw-software-crafter-reviewer, nw-solution-architect-reviewer, nw-platform-architect-reviewer) — all verdicts NEEDS_REVISION.

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Token store default (auth-web) | **In-memory default**; web-storage store becomes explicit opt-in with documented threat-model note | XSS must not exfiltrate long-lived refresh tokens by default; silent re-auth replaces persistence |
| D2 | Concurrency semantics | **Optimistic-by-default**: `put()` uses the revision read by the preceding read as `expectedRevision`; explicit `force` opt-out for LWW | Matches README's existing "optimistic concurrency" promise; ends the 3-providers-LWW vs iCloud-conditional divergence; use Dropbox conditional upload mode, Drive documented best-effort. Elaboration (2026-10-12, roadmap review): expectedRevision against a non-existent key rejects with ConflictError uniformly — standardizes existing majority-provider behavior |
| D3 | CloudKit transport | **Revert to spec's injected `CloudKitClient` interface** with CloudKit JS implementation owning web sign-in | REST + API-token-only cannot reach the private database (no user auth); spec 2026-04-15-icloud-provider-design.md §2/§7 already approved this shape; needs Apple web-auth-token provisioning (operator-side) |
| D4 | OAuth port location | **Move `OAuthClient`/`OAuthTokens` into `@storage-bridge/core`**; drop providers' auth-web peerDependencies; un-private auth-web and auth-react-native | Publishable packages cannot peer-depend on private ones; auth-react-native currently depends on the browser package — wrong layer owns the port |
| D5 | Module format | **ESM-only**; drop the ambiguous `default` export condition; document the decision in README | Audience is browser/RN/Metro; source already uses extensionful relative imports; no CJS build to maintain |

## Rejected Simple Alternatives (per nw-roadmap-design Simplest Solution Gate)

### Alternative 1: Documentation-only remediation (no code changes)
- What: Document current behavior (LWW default, localStorage tokens, truncation) instead of fixing it.
- Expected Impact: ~10% of problem (docs drift only).
- Why Insufficient: Data-loss bugs are empirically reproduced (Drive quote-key round-trip; Dropbox truncated-listing duplicate writes); no documentation fixes silent data disappearance.

### Alternative 2: Fix blockers only (P0), defer P1/P2 indefinitely
- What: Ship only the 14 blocking fixes; skip contract-suite expansion, OAuth robustness, tooling hygiene.
- Expected Impact: ~70% of problem.
- Why Insufficient: Without the expanded contract suite (task #8) the same bug classes regress silently — the reviews proved the current suite passes over live defects. Without lint/CI/release engineering the gates stay unenforced (lint is red 8/8 today).

### Why the full 4-wave solution is necessary
1. Enforcement must precede fixes (Wave 0) or fixes land against the weak suite that shipped the bugs.
2. Publishing story is non-functional without D4 + release engineering — the library's distribution goal is blocked, not just its defects.
