# Feature Delta: review-remediation

DELIVER wave-delta for the 2026-10-12 remediation delivery. Tier-1 reference record;
full history lives in `deliver/execution-log.json` and `deliver/roadmap.json`.

## Wave: DELIVER / [REF] Implementation Summary

19-step remediation executed across four phases (contract-suite enforcement →
data-integrity/concurrency fixes → OAuth/auth hardening → release readiness), commit
range `391f29e..f57aa1c` (21 commits including the L1-L6 refactor `e649ba9` and the
phase-4 revision `f57aa1c`). Headline outcomes: **security (D1)** — in-memory default
token store with documented web-storage opt-in, so XSS can no longer exfiltrate
refresh tokens by default; **data-integrity fixes (D2 + hardening)** —
optimistic-by-default concurrency, full pagination on all four providers, Drive
query escaping, ConflictError carrying the logical key, coded-error taxonomy;
**iCloud spec conformance (D3)** — injected `CloudKitClient` port with a CloudKit JS
adapter per the 2026-04-15 spec, replacing the REST/API-token dead end; **OAuth port
+ TokenManager (D4)** — `OAuthClient`/`OAuthTokens`/`TokenManager` in
`@storage-bridge/core` with single-flight refresh, auth packages un-private and
publishable as thin login adapters; **release readiness (D5)** — ESM-only exports,
changesets, per-package publish metadata, GitHub Actions CI, monorepo lint green.

## Wave: DELIVER / [REF] Files Modified

111 files, +7,974/−1,686 (`git diff --stat 1326637..HEAD`). Grouped:

- **Production (31)**: core — `oauth.ts` (new OAuth port + TokenManager),
  `manager.ts`, `errors.ts` (coded + cause wrapping), `types.ts`, `index.ts`, 3
  providers under `src/providers/`; auth-web — `oauth-client.ts`,
  `token-store.ts` (in-memory default), `redirect-handler.ts`, `pkce.ts`,
  `types.ts`; auth-react-native — `secure-token-store.ts`, `oauth-client.ts`
  (core-port adapter), `deep-link-handler.ts`, `types.ts`; provider-dropbox —
  `dropbox-provider.ts`, `dropbox-mapper.ts`, `index.ts`; provider-google-drive —
  `google-drive-provider.ts`; provider-icloud — `cloudkit-js-client.ts` (new),
  `cloudkit-client.ts`, `icloud-provider.ts`, `record-mapper.ts`, `index.ts`;
  provider-onedrive — `onedrive-provider.ts`; testing —
  `provider-contract-tests.ts` (shared suite), `fixtures.ts`, `fake-provider.ts`,
  `index.ts`.
- **Tests (36)**: per-provider `*-contract.test.ts` ×4 (suite rewired), new
  `core/oauth-token-manager.test.ts`, `core/providers/local-contract.test.ts`,
  `icloud/cloudkit-js-client.test.ts`, RN `default-token-store(.absent).test.ts`;
  hardening updates across all 8 packages' `__tests__` plus API mocks.
- **Docs (10)**: `docs/settings-store-architecture.md` (rewritten to shipped
  reality), root `README.md`, 8 new per-package `README.md` files.
- **Tooling (34)**: new `.github/workflows/ci.yml`, `.changeset/config.json`,
  `.prettierrc`/`.prettierignore`, per-package `eslint.config.js` ×4; `turbo.json`
  task graph, `pnpm-workspace.yaml`, lockfile; `package.json` ×11 (ESM-only
  exports, publish metadata, pinned ranges), `tsconfig.json` ×8 +
  `typescript-config/base.json`, `vitest.config.ts` ×2, `eslint-config/index.js`.

## Wave: DELIVER / [REF] Scenarios Green Count

Final state (measured at the 2026-10-12 gate run, all commands exit 0):

- **16/16 turbo test tasks green**; per package: core 223 passed (+5 todo),
  testing 68 (+5 todo), auth-web 53, auth-react-native 49, provider-google-drive
  76, provider-onedrive 67, provider-icloud 106, provider-dropbox 72 — **714
  passed, 10 todo, 0 failed across 8 packages**.
- **Contract suite: 45 scenarios/provider** (was 25 pre-remediation), zero
  expected-fail, zero pending families; only structural in-memory `todo`s remain
  (5 core + 5 testing).
- CI workflow (01-03) runs the same gates on Node 22/24.

## Wave: DELIVER / [REF] DoD Check

- All **68 acceptance criteria across 19 roadmap steps** satisfied — verified
  per-step by crafter RED/GREEN/COMMIT gates (execution-log: 63/63 EXECUTED).
- Decisions **D1–D5 implemented** (`decisions.md`): D1 in-memory default (03-01),
  D2 optimistic-by-default (02-02), D3 injected CloudKitClient (03-05), D4 OAuth
  port in core (03-02), D5 ESM-only (04-01).
- Roadmap review APPROVED (cycle 1); post-merge integration gate PASS.

## Wave: DELIVER / [REF] Demo Evidence

N/A in the classic sense — DISCUSS/DISTILL waves were skipped (feature originated
from the 2026-10-12 cross-wave tri-review), so no `.feature` scenarios or
elevator-pitch stories exist. Executable evidence instead:

- Validation gates green: `pnpm typecheck && pnpm lint && pnpm build && pnpm test`
  exit 0 (build 8/8, typecheck 10/10 incl `^build`, lint 8/8, test 16/16).
- 8/8 publish dry-runs (04-01 release engineering, commit `2d6408e`).
- CI workflow landed at 01-03 (`f435235`).
- Post-merge integration gate: PASS (`execution-log.json` `gates[0]`,
  2026-10-12T14:35Z, orchestrator uncached re-run all exit 0).

## Wave: DELIVER / [REF] Quality Gates

- Roadmap review: **APPROVED** (cycle 1, nw-acceptance-designer-reviewer; 3
  blockers resolved in-file).
- Per-step TDD: **21 step-ids × 3 phases (RED/GREEN/COMMIT) = 63 EXECUTED/PASS**
  (19 roadmap steps + `phase3-refactor` + `phase4-revision`).
- Phase-3 refactor: `e649ba9` (L1-L6 consolidation pass over the feature diff).
- Phase-4 review: **NEEDS_REVISION → revision `f57aa1c` → PASS** (RN README
  quick-start, token-shape validation, error surfacing).
- Mutation: nightly-delta strategy — kill-rate gate deferred to the CI nightly
  pipeline per roadmap validation notes; not run per-feature.
- Execution-log integrity: **PASS** (63 entries).

## Wave: DELIVER / [REF] Pre-requisites

Inputs consumed:

- `docs/feature/review-remediation/decisions.md` — D1–D5, user-approved 2026-10-12.
- `docs/feature/review-remediation/deliver/roadmap.json` — 19 steps, 4 phases, 68
  acceptance criteria; roadmap review APPROVED.
- Tri-review findings (2026-10-12 session: nw-software-crafter-reviewer,
  nw-solution-architect-reviewer, nw-platform-architect-reviewer — all
  NEEDS_REVISION).
- `docs/superpowers/specs/2026-04-15-icloud-provider-design.md` — §2/§7 basis
  for D3.

## Wave: DELIVER / [WHY] Upstream Issues

Recorded honestly for future features:

1. **FAMILY_OWNERS map vs step-definition discrepancy** — the 01-01 unskip-owner
   map disagreed with the step definitions on which step owns the error-taxonomy
   scenario family (02-01 vs 02-06). Resolved in favor of the step definitions;
   the roadmap review's non-blocking nitpick had flagged the same gap.
2. **02-04 disconnected-operations residual** — the shared-suite
   disconnected-operations family activation was folded into 02-06 by the
   orchestrator (02-04 delivered local-provider disconnect semantics; 02-06's
   uniform pre-connect guard completed the family activation, per the
   `PENDING_FAMILIES` note in `dropbox-contract.test.ts`).
3. **Execution-log JSON corruption at 03-04** — stray closing tokens from the
   manually scaffolded file made it unparseable; repaired with all entries
   preserved verbatim. Read-verify-before-append discipline adopted afterward.
4. **Operator-blocked real-CloudKit verification** — D3's injected
   `CloudKitClient` is implemented and tested against mocks, but end-to-end
   verification against real CloudKit awaits Apple web-auth-token provisioning
   (operator-side dependency; documented in `decisions.md` D3).
