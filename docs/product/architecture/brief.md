# Storage Bridge — Architecture Brief

> Minimal single-source-of-truth overview. Full detail (flows, error taxonomy,
> per-provider semantics): `docs/settings-store-architecture.md` — canonical and
> matches shipped reality.

## Packages

Nine functional packages (+2 internal build-tooling configs):

| Package | Role |
|---|---|
| `@storage-bridge/core` | Zero-dependency domain: settings-store manager, error taxonomy, provider contracts, OAuth port + `TokenManager` |
| `@storage-bridge/testing` | Shared provider contract suite (45 scenarios) plus fixtures and fakes |
| `@storage-bridge/auth-web` | Browser OAuth adapter (PKCE two-phase flow); in-memory default token store |
| `@storage-bridge/auth-react-native` | React Native OAuth adapter; expo-secure-store default token store |
| `@storage-bridge/provider-dropbox` | Dropbox data provider (native conditional upload) |
| `@storage-bridge/provider-google-drive` | Google Drive data provider (best-effort conflict detection) |
| `@storage-bridge/provider-icloud` | iCloud data provider via injected `CloudKitClient` port (CloudKit JS adapter) |
| `@storage-bridge/provider-onedrive` | OneDrive data provider |
| — | Internal build-tooling: `@storage-bridge/eslint-config`, `@storage-bridge/typescript-config` |

Dependency rule: `core` depends on nothing; providers depend on `core` only; auth
packages implement `core`'s `OAuthClient`/`TokenStore` ports.

## Key Decisions (D1–D5)

- **D1** — In-memory default token store; web-storage persistence is explicit,
  documented opt-in.
- **D2** — Optimistic-by-default concurrency: `put()` checks `expectedRevision`
  from the preceding read; `force` opts out of LWW.
- **D3** — iCloud uses the spec's injected `CloudKitClient` interface; CloudKit JS
  owns web sign-in.
- **D4** — OAuth port lives in `core`; auth packages are publishable adapters.
- **D5** — ESM-only; no CJS build, no ambiguous `default` export condition.

Full rationale: `docs/feature/review-remediation/decisions.md`.

## KPIs / Observability

None defined for this library yet — future work: KPI contracts when a host
application ships.
