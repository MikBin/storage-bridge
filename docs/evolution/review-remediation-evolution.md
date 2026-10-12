# Evolution: review-remediation

Date: 2026-10-12
Status: Complete — DELIVER finalized
Origin: cross-wave tri-review of 2026-10-12 (DISCUSS/DISTILL intentionally skipped;
the feature was born from review findings, not product discovery)

## What This Feature Was

A remediation of the storage-bridge monorepo driven by a three-reviewer tri-review
(nw-software-crafter-reviewer, nw-solution-architect-reviewer,
nw-platform-architect-reviewer) that returned NEEDS_REVISION across the board:
silent data-integrity bugs, an insecure-by-default token store, a dead-end iCloud
transport, an OAuth port owned by the wrong layer, and no enforced quality or
release gates. The feature turned 19 findings into 19 roadmap steps across four
phases — enforcement first (contract suite, lint, CI), then fixes, then auth
hardening, then release engineering — and delivered all of them.

## Headline Metrics

| Metric | Value |
|---|---|
| Findings → roadmap steps | 19 → 19 (68 acceptance criteria) |
| Commits | 21 (`391f29e..f57aa1c`, incl. refactor `e649ba9` + revision `f57aa1c`) |
| Diff | 111 files, +7,974/−1,686 (packages-only: 101 files, +7,428/−1,518) |
| Contract suite | 25 → 45 scenarios/provider; 0 expected-fail, 0 pending families |
| Test totals | 714 passed + 10 structural todo across 8 packages; 16/16 turbo tasks |
| Gates | typecheck / lint / build / test exit 0; 8/8 publish dry-runs; CI on Node 22/24 |
| Execution log | 63/63 entries EXECUTED; integrity PASS |

## What Changed Architecturally

- **OAuth port moved into `core` (D4).** `OAuthClient`, `OAuthTokens`,
  `PendingAuthState`, and `TokenManager` now live in `@storage-bridge/core`
  (`src/oauth.ts`). auth-web and auth-react-native became thin login adapters
  (browser redirect / deep-link flows) over the shared `TokenManager`, which owns
  single-flight refresh, expiry-aware retrieval, and failure classification
  (endpoint 400/401/403 → `AuthRequiredError`; transport → `AuthExchangeError`).
  Providers depend on core only; no auth peer-dependencies.
- **Insecure-by-default token persistence removed (D1).** auth-web defaults to an
  in-memory store with silent re-auth; persisted web-storage is an explicit,
  documented opt-in. RN defaults to expo-secure-store resolved dynamically.
- **Uniform optimistic concurrency (D2).** `put()` validates `expectedRevision`
  from the preceding read across all providers (missing key → `ConflictError`
  carrying the logical key); `force` opts out. Ends the LWW-vs-conditional
  divergence between providers.
- **Injected `CloudKitClient` for iCloud (D3).** The provider now takes a
  CloudKit-client port per the 2026-04-15 spec, with a CloudKit JS adapter owning
  web sign-in; the REST/API-token variant could never reach the private database.
- **Scaffold-then-unskip contract mechanism.** Step 01-01 landed post-remediation
  behaviors as declared skipped families (`PENDING_FAMILIES`) inside the shared
  45-scenario suite; each owning remediation step activated its family as its
  acceptance gate. Enforcement preceded fixes — fixes landed against a suite that
  could actually catch regressions. This is a reusable pattern for
  enforcement-first remediation of any codebase with a weak suite.

## Lessons and Issues

Recorded in the feature delta's `[WHY] Upstream Issues` section
(`docs/feature/review-remediation/feature-delta.md`): the FAMILY_OWNERS/step-definition
discrepancy (resolved in favor of step definitions), the 02-04→02-06 family-residual
fold, the execution-log JSON corruption at 03-04 (repaired, read-verify-before-append
adopted), and the operator-blocked real-CloudKit verification.

## Residual Risks

- **First-create race**: two concurrent writers creating the same new key can still
  race; documented out of scope for this remediation.
- **Drive TOCTOU**: Google Drive has no native conditional-upload mode; conflict
  detection there is best-effort (Dropbox has the real conditional mode).
- **Real-CloudKit E2E unverified**: D3 implementation is mock-tested only until
  Apple web-auth-token provisioning is done (operator dependency).
- **Mutation gate deferred**: nightly-delta strategy means the kill-rate gate runs
  first at CI-nightly, not locally; the contract suite is the local backstop until
  the first nightly run.

## Permanent Artifacts

- `docs/evolution/review-remediation-evolution.md` — this document.
- `docs/product/architecture/brief.md` — minimal SSOT architecture brief.
- `docs/settings-store-architecture.md` — canonical detailed architecture
  (rewritten to shipped reality during this feature).
- Delivery history preserved: `docs/feature/review-remediation/` (decisions.md,
  deliver/roadmap.json, deliver/execution-log.json, feature-delta.md).
