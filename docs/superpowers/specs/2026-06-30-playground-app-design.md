# Playground App — Design Spec

## Overview

Create a local, interactive web playground app in `apps/playground` using Vanilla HTML, CSS, and TypeScript powered by Vite. The playground allows developers to connect to different storage providers (Local, Google Drive, Dropbox, OneDrive, and iCloud) and test settings document operations (CRUD, list, revision conflicts) through a beautiful dashboard UI.

## Context

`TASK-15` requires a playground app for manual verification of settings store behaviors. To support this:
- The UI must dynamically connect/disconnect from providers.
- It must allow inputting credentials (e.g. Client IDs) dynamically in the UI.
- It must persist these inputs in `localStorage` for ease of testing.
- It must support the `local` provider out of the box with zero external configuration.

---

## Provider Developer Account Registration & Free Tiers

Here is what is required for registering and testing each provider in the playground:

| Provider | Portal | Subscription Cost | Free Testing Tier | OAuth / Config Requirements |
|---|---|---|---|---|
| **Local** | None | Free | **Unlimited** (Offline/In-memory) | None (works out-of-the-box). |
| **Google Drive** | [Google Cloud Console](https://console.cloud.google.com/) | Free | **Yes (Free)**. Google Drive API usage is free; stored files count against the user's 15 GB free Drive storage. | Needs Google API project, OAuth Client ID configured for web, and `drive.appdata` scope. |
| **Dropbox** | [Dropbox App Console](https://www.dropbox.com/developers/apps) | Free | **Yes (Free)**. Development apps are free and can link up to 500 accounts before applying for Production. | Needs App Console project with App Folder permissions to get a Client ID. |
| **OneDrive** | [Microsoft Entra ID](https://entra.microsoft.com/) | Free | **Yes (Free)**. Register an app with a personal MS account or join Microsoft 365 Developer Program for a free E5 tenant. | Needs Multitenant + Personal Accounts support and Client ID. |
| **iCloud** | [Apple Developer Portal](https://developer.apple.com/) | **$99/year** subscription (Apple Developer Program) | **No free tier** for developer portal access (requires membership). Private database usage is free for the end-user's quota. | Requires Apple Developer membership, iCloud container creation, and CloudKit JS configuration. |

---

## Design and Architecture

### UI Dashboard Layout (Approach 1 - Recommended)

The application will feature a premium, dark-mode developer console layout with three main sections:
1. **Sidebar - Provider & Auth Control**:
   - Selector dropdown for current provider.
   - Dynamic credential inputs (Client ID, Redirect URI, etc.) that hide/show based on the selected provider.
   - Status indicators showing connection state (Disconnected, Connecting, Connected) and user profile info (email, avatar/name) once logged in.
   - Connect/Disconnect buttons.
2. **Main Panel - Settings CRUD**:
   - Document List: Sidebar/table listing keys (`store.list()`) with their last updated timestamps and revision tags.
   - Create/Update Form: Input field for the document key, a JSON editor textarea for the payload, and an optional "Expected Revision" field to test optimistic concurrency conflicts.
   - Action Buttons: **Fetch**, **Save**, and **Delete**.
3. **Live API Log Terminal**:
   - A scrollable console window displaying chronological logs of the actual `@storage-bridge/core` method invocations (e.g., `DefaultSettingsStore.put("preferences", { theme: "dark" }, { expectedRevision: "rev-1" }) -> Error: ConflictError`).

---

## Proposed Changes

We will create a new subproject in `apps/playground` structured as follows:

### Package Directory Layout
```
apps/playground/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.ts
    └── style.css
```

#### [NEW] `apps/playground/package.json`
Defines the workspace dependencies on `@storage-bridge/core` and `@storage-bridge/auth-web`.

#### [NEW] `apps/playground/tsconfig.json`
Extends the base TypeScript configuration for a Vite web-runtime app.

#### [NEW] `apps/playground/vite.config.ts`
Vite configuration for building and running the development server.

#### [NEW] `apps/playground/index.html`
HTML structure containing dashboard container elements, selectors, forms, and logs.

#### [NEW] `apps/playground/src/style.css`
A premium, dark-mode styling stylesheet utilizing CSS variables for theme flexibility.

#### [NEW] `apps/playground/src/main.ts`
- Initializes the settings store manager.
- Restores credentials/connection state from `localStorage` on page load.
- Registers DOM event listeners for buttons and form submissions.
- Executes `store.connect()`, `store.get()`, `store.put()`, `store.delete()`, and `store.list()`.
- Captures API calls/failures and prints them to the live visual console.
- Resolves OAuth redirect params on mount (if redirected back).

---

## Verification Plan

### Manual Verification
1. Run the dev server using `turbo dev --filter=playground`.
2. Connect to the **Local** provider immediately and perform full CRUD:
   - Create a document key `preferences` with JSON data.
   - Verify it appears in the listed documents.
   - Modify the document and save it.
   - Attempt to save with a mismatched `expectedRevision` to trigger and verify a conflict error in the logs.
   - Delete the document.
3. Supply credentials for **Google Drive/Dropbox/OneDrive** and verify OAuth redirects, successful connection, profile fetching, and remote document CRUD.
