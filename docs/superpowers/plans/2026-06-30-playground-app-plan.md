# Interactive Playground App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a lightweight web-based developer dashboard app in `apps/playground` using Vanilla HTML/TypeScript and Vite to interactively test the storage-bridge SettingsStore API across all providers.

**Architecture:** A Single-Page Application (SPA) dashboard containing panels for provider selection, credential entry, connection management, document CRUD, and a live API event log terminal. Credentials and active provider state will be persisted in `localStorage` to handle OAuth redirection.

**Tech Stack:** Vanilla HTML/CSS, TypeScript, Vite.

---

### Task 1: Scaffolding and Configuration

**Files:**
- Create: `apps/playground/package.json`
- Create: `apps/playground/tsconfig.json`
- Create: `apps/playground/vite.config.ts`
- Create: `apps/playground/eslint.config.js`

- [ ] **Step 1: Create package.json**
  Write package configuration with appropriate dependencies to the workspace:
  ```json
  {
    "name": "@storage-bridge/playground",
    "version": "1.0.0",
    "private": true,
    "type": "module",
    "scripts": {
      "dev": "vite",
      "build": "tsc && vite build",
      "preview": "vite preview",
      "typecheck": "tsc --noEmit",
      "lint": "eslint src/"
    },
    "dependencies": {
      "@storage-bridge/core": "workspace:*",
      "@storage-bridge/auth-web": "workspace:*",
      "@storage-bridge/provider-google-drive": "workspace:*",
      "@storage-bridge/provider-dropbox": "workspace:*",
      "@storage-bridge/provider-onedrive": "workspace:*",
      "@storage-bridge/provider-icloud": "workspace:*"
    },
    "devDependencies": {
      "vite": "^5.0.0",
      "typescript": "latest",
      "@storage-bridge/eslint-config": "workspace:*",
      "@storage-bridge/typescript-config": "workspace:*"
    }
  }
  ```

- [ ] **Step 2: Create tsconfig.json**
  Write the TypeScript configuration:
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "noEmit": true,
      "lib": ["DOM", "DOM.Iterable", "ES2022"]
    },
    "include": ["src/**/*"]
  }
  ```

- [ ] **Step 3: Create vite.config.ts**
  Write Vite configuration specifying default port:
  ```typescript
  import { defineConfig } from 'vite';

  export default defineConfig({
    server: {
      port: 5173,
    },
  });
  ```

- [ ] **Step 4: Create eslint.config.js**
  Write ESLint configuration extending the workspace rules:
  ```javascript
  import defaultConfig from '@storage-bridge/eslint-config';

  export default [...defaultConfig];
  ```

- [ ] **Step 5: Run pnpm install**
  Run `pnpm install` in the root workspace to install dependencies.
  Run: `pnpm install`

- [ ] **Step 6: Commit changes**
  Run:
  ```bash
  git add apps/playground/package.json apps/playground/tsconfig.json apps/playground/vite.config.ts apps/playground/eslint.config.js
  git commit -m "feat: scaffold playground app configuration"
  ```

---

### Task 2: HTML Layout Setup

**Files:**
- Create: `apps/playground/index.html`

- [ ] **Step 1: Write index.html structure**
  Implement the full HTML structure including forms for credentials, provider selector, CRUD editor, log viewer, and script connection:
  ```html
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Storage Bridge Playground</title>
      <link rel="stylesheet" href="/src/style.css" />
    </head>
    <body>
      <div class="app-container">
        <!-- Sidebar: Provider config -->
        <aside class="sidebar">
          <h2>Storage Bridge</h2>
          <div class="form-group">
            <label for="provider-select">Select Provider</label>
            <select id="provider-select">
              <option value="local">Local (In-Memory)</option>
              <option value="google-drive">Google Drive</option>
              <option value="dropbox">Dropbox</option>
              <option value="onedrive">OneDrive</option>
              <option value="icloud">iCloud</option>
            </select>
          </div>

          <div id="credentials-section">
            <div class="form-group config-field" id="field-client-id">
              <label for="input-client-id">Client ID</label>
              <input type="text" id="input-client-id" placeholder="Enter OAuth Client ID" />
            </div>
            <div class="form-group config-field" id="field-redirect-uri">
              <label for="input-redirect-uri">Redirect URI</label>
              <input type="text" id="input-redirect-uri" value="http://localhost:5173" />
            </div>
          </div>

          <div class="connection-status-panel">
            <div class="status-line">Status: <span id="status-badge" class="badge badge-disconnected">Disconnected</span></div>
            <div id="profile-info" class="hidden">
              <div class="profile-detail">User ID: <span id="profile-id">-</span></div>
              <div class="profile-detail">Email: <span id="profile-email">-</span></div>
            </div>
          </div>

          <div class="actions-group">
            <button id="btn-connect" class="btn btn-primary">Connect</button>
            <button id="btn-disconnect" class="btn btn-secondary" disabled>Disconnect</button>
          </div>
        </aside>

        <!-- Main workspace: Document CRUD and Logs -->
        <main class="workspace">
          <section class="crud-panel">
            <h3>Document Manager</h3>
            <div class="crud-layout">
              <div class="doc-list-container">
                <h4>Stored Documents</h4>
                <ul id="doc-list">
                  <!-- Dynamic items -->
                </ul>
              </div>
              <div class="editor-container">
                <h4>Document Editor</h4>
                <div class="form-group">
                  <label for="doc-key">Document Key</label>
                  <input type="text" id="doc-key" placeholder="e.g. preferences" />
                </div>
                <div class="form-group">
                  <label for="doc-revision">Expected Revision (Optional)</label>
                  <input type="text" id="doc-revision" placeholder="e.g. rev-1" />
                </div>
                <div class="form-group">
                  <label for="doc-data">JSON Payload</label>
                  <textarea id="doc-data" placeholder="{}"></textarea>
                </div>
                <div class="editor-actions">
                  <button id="btn-doc-get" class="btn">Get</button>
                  <button id="btn-doc-put" class="btn btn-success">Put</button>
                  <button id="btn-doc-delete" class="btn btn-danger">Delete</button>
                </div>
              </div>
            </div>
          </section>

          <section class="logs-panel">
            <h3>API Live Console</h3>
            <div id="api-logs" class="logs-content"></div>
            <button id="btn-clear-logs" class="btn btn-sm">Clear Logs</button>
          </section>
        </main>
      </div>
      <script type="module" src="/src/main.ts"></script>
    </body>
  </html>
  ```

- [ ] **Step 2: Commit index.html**
  Run:
  ```bash
  git add apps/playground/index.html
  git commit -m "feat: add playground HTML layout"
  ```

---

### Task 3: Premium CSS Styling

**Files:**
- Create: `apps/playground/src/style.css`

- [ ] **Step 1: Write stylesheet contents**
  Write premium responsive layout CSS variables, shadows, transitions, and dark-mode styles:
  ```css
  :root {
    --bg-primary: #0f172a;
    --bg-secondary: #1e293b;
    --bg-tertiary: #334155;
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --accent: #3b82f6;
    --accent-hover: #2563eb;
    --success: #10b981;
    --danger: #ef4444;
    --border: #475569;
    --font: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    background-color: var(--bg-primary);
    color: var(--text-primary);
    font-family: var(--font);
    height: 100vh;
    overflow: hidden;
  }

  .app-container {
    display: grid;
    grid-template-columns: 320px 1fr;
    height: 100vh;
  }

  .sidebar {
    background-color: var(--bg-secondary);
    border-right: 1px solid var(--border);
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    overflow-y: auto;
  }

  .sidebar h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    border-bottom: 2px solid var(--accent);
    padding-bottom: 0.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-size: 0.85rem;
    color: var(--text-secondary);
    font-weight: 600;
  }

  input, select, textarea {
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--text-primary);
    padding: 0.75rem;
    border-radius: 6px;
    font-family: inherit;
    font-size: 0.95rem;
    width: 100%;
    transition: border-color 0.2s;
  }

  input:focus, select:focus, textarea:focus {
    border-color: var(--accent);
    outline: none;
  }

  textarea {
    resize: vertical;
    min-height: 150px;
  }

  .badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: bold;
  }

  .badge-disconnected {
    background-color: var(--danger);
    color: #fff;
  }

  .badge-connecting {
    background-color: #f59e0b;
    color: #fff;
  }

  .badge-connected {
    background-color: var(--success);
    color: #fff;
  }

  .connection-status-panel {
    background-color: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .profile-detail {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .hidden {
    display: none !important;
  }

  .actions-group {
    display: flex;
    gap: 1rem;
    margin-top: auto;
  }

  .btn {
    padding: 0.75rem 1.25rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    font-family: inherit;
    transition: background-color 0.2s, opacity 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background-color: var(--accent);
    color: #fff;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--accent-hover);
  }

  .btn-secondary {
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: var(--border);
  }

  .btn-success {
    background-color: var(--success);
    color: #fff;
  }

  .btn-danger {
    background-color: var(--danger);
    color: #fff;
  }

  .workspace {
    display: grid;
    grid-template-rows: 1fr 280px;
    height: 100vh;
    overflow: hidden;
  }

  .crud-panel {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    overflow: hidden;
  }

  .crud-layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 2rem;
    height: 100%;
    overflow: hidden;
  }

  .doc-list-container, .editor-container {
    background-color: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow: hidden;
  }

  #doc-list {
    list-style: none;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    height: 100%;
  }

  .doc-item {
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border);
    padding: 0.75rem;
    border-radius: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .doc-item:hover {
    border-color: var(--accent);
  }

  .doc-meta {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .editor-actions {
    display: flex;
    gap: 1rem;
  }

  .logs-panel {
    background-color: #0b0f19;
    border-top: 1px solid var(--border);
    padding: 1.5rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow: hidden;
    position: relative;
  }

  .logs-content {
    background-color: #05070c;
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 1rem;
    flex-grow: 1;
    overflow-y: auto;
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.85rem;
    line-height: 1.4;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .log-entry {
    color: #e2e8f0;
  }

  .log-time {
    color: #64748b;
    margin-right: 0.5rem;
  }

  .log-success {
    color: #34d399;
  }

  .log-error {
    color: #f87171;
  }

  .btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
    position: absolute;
    top: 1.5rem;
    right: 2rem;
  }
  ```

- [ ] **Step 2: Commit style.css**
  Run:
  ```bash
  git add apps/playground/src/style.css
  git commit -m "feat: add playground CSS styling"
  ```

---

### Task 4: Store Initialization & Auth Redirection Logic

**Files:**
- Create: `apps/playground/src/main.ts`

- [ ] **Step 1: Write main.ts implementation**
  Develop the core TypeScript logic for connecting to providers, resolving OAuth redirect callbacks, loading credentials, saving to localStorage, and displaying state details.
  ```typescript
  import {
    createSettingsStore,
    LocalDocumentStoreProvider,
    ProviderRegistry,
    DefaultSettingsStore,
    ProviderId,
    ConnectedProfile,
    SettingsSummary,
    ConflictError,
  } from '@storage-bridge/core';

  import {
    BrowserOAuthClient,
    handleCallback,
    OAuthProviderConfig,
  } from '@storage-bridge/auth-web';

  import { GoogleDriveProvider } from '@storage-bridge/provider-google-drive';
  import { DropboxProvider } from '@storage-bridge/provider-dropbox';
  import { OneDriveProvider } from '@storage-bridge/provider-onedrive';

  // Elements
  const elProviderSelect = document.getElementById('provider-select') as HTMLSelectElement;
  const elClientIdInput = document.getElementById('input-client-id') as HTMLInputElement;
  const elRedirectUriInput = document.getElementById('input-redirect-uri') as HTMLInputElement;
  const elStatusBadge = document.getElementById('status-badge') as HTMLElement;
  const elProfileInfo = document.getElementById('profile-info') as HTMLElement;
  const elProfileId = document.getElementById('profile-id') as HTMLElement;
  const elProfileEmail = document.getElementById('profile-email') as HTMLElement;
  const elBtnConnect = document.getElementById('btn-connect') as HTMLButtonElement;
  const elBtnDisconnect = document.getElementById('btn-disconnect') as HTMLButtonElement;

  const elDocKeyInput = document.getElementById('doc-key') as HTMLInputElement;
  const elDocRevisionInput = document.getElementById('doc-revision') as HTMLInputElement;
  const elDocDataTextarea = document.getElementById('doc-data') as HTMLTextAreaElement;
  const elBtnDocGet = document.getElementById('btn-doc-get') as HTMLButtonElement;
  const elBtnDocPut = document.getElementById('btn-doc-put') as HTMLButtonElement;
  const elBtnDocDelete = document.getElementById('btn-doc-delete') as HTMLButtonElement;
  const elDocList = document.getElementById('doc-list') as HTMLUListElement;

  const elApiLogs = document.getElementById('api-logs') as HTMLElement;
  const elBtnClearLogs = document.getElementById('btn-clear-logs') as HTMLButtonElement;

  // Logging system
  function log(message: string, type: 'info' | 'success' | 'error' = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = new Date().toLocaleTimeString();
    
    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    
    entry.appendChild(timeSpan);
    entry.appendChild(textSpan);
    
    elApiLogs.appendChild(entry);
    elApiLogs.scrollTop = elApiLogs.scrollHeight;
  }

  elBtnClearLogs.addEventListener('click', () => {
    elApiLogs.innerHTML = '';
    log('Logs cleared.');
  });

  // State Management
  interface PlaygroundState {
    providerId: ProviderId;
    clientId: string;
    redirectUri: string;
  }

  function loadState(): PlaygroundState {
    const raw = localStorage.getItem('sb_playground_state');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
    return {
      providerId: 'local',
      clientId: '',
      redirectUri: window.location.origin,
    };
  }

  function saveState() {
    const state: PlaygroundState = {
      providerId: elProviderSelect.value as ProviderId,
      clientId: elClientIdInput.value,
      redirectUri: elRedirectUriInput.value,
    };
    localStorage.setItem('sb_playground_state', JSON.stringify(state));
  }

  // Registry construction
  const registry = new ProviderRegistry();
  const store = new DefaultSettingsStore(registry);

  // Register Local provider
  registry.register({
    id: 'local',
    label: 'Local (In-Memory)',
    capabilities: ['offline-cache', 'web'],
    isSupported: async () => true,
    create: () => new LocalDocumentStoreProvider(),
  });

  // Configure UI field visibility based on selected provider
  function updateUIFieldVisibility() {
    const provider = elProviderSelect.value;
    const isLocal = provider === 'local';
    const isICloud = provider === 'icloud';

    const fieldsSection = document.getElementById('credentials-section') as HTMLElement;
    if (isLocal || isICloud) {
      fieldsSection.classList.add('hidden');
    } else {
      fieldsSection.classList.remove('hidden');
    }
  }

  elProviderSelect.addEventListener('change', () => {
    updateUIFieldVisibility();
    saveState();
  });

  // Fetch documents and render list
  async function refreshDocumentList() {
    try {
      log('Fetching document list...');
      const docs = await store.list();
      elDocList.innerHTML = '';
      docs.forEach(doc => {
        const li = document.createElement('li');
        li.className = 'doc-item';
        
        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = `
          <strong>${doc.key}</strong>
          <div class="doc-meta">Revision: ${doc.revision ?? 'none'}</div>
        `;
        
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger btn-sm';
        delBtn.textContent = 'Delete';
        delBtn.style.position = 'static';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            log(`Deleting document: ${doc.key}...`);
            await store.delete(doc.key);
            log(`Deleted document: ${doc.key}`, 'success');
            refreshDocumentList();
          } catch (err: any) {
            log(`Failed to delete document: ${err.message}`, 'error');
          }
        });

        li.appendChild(infoDiv);
        li.appendChild(delBtn);
        li.addEventListener('click', () => loadDocumentIntoEditor(doc.key));

        elDocList.appendChild(li);
      });
      log(`Found ${docs.length} documents.`, 'success');
    } catch (err: any) {
      log(`Failed to list documents: ${err.message}`, 'error');
    }
  }

  async function loadDocumentIntoEditor(key: string) {
    try {
      log(`Loading document: ${key}...`);
      const envelope = await store.get<any>(key);
      if (envelope) {
        elDocKeyInput.value = envelope.key;
        elDocRevisionInput.value = envelope.revision ?? '';
        elDocDataTextarea.value = JSON.stringify(envelope.data, null, 2);
        log(`Document loaded: ${key}`, 'success');
      } else {
        log(`Document ${key} not found`, 'error');
      }
    } catch (err: any) {
      log(`Failed to fetch document: ${err.message}`, 'error');
    }
  }

  // Update Status UI
  async function updateStatusUI() {
    const isConnected = await store.isConnected();
    if (isConnected) {
      elStatusBadge.textContent = 'Connected';
      elStatusBadge.className = 'badge badge-connected';
      elBtnConnect.disabled = true;
      elBtnDisconnect.disabled = false;
      elProviderSelect.disabled = true;

      const profile = await store.getProfile();
      if (profile) {
        elProfileInfo.classList.remove('hidden');
        elProfileId.textContent = profile.accountId ?? 'unknown';
        elProfileEmail.textContent = profile.email ?? 'unknown';
      }
      refreshDocumentList();
    } else {
      elStatusBadge.textContent = 'Disconnected';
      elStatusBadge.className = 'badge badge-disconnected';
      elBtnConnect.disabled = false;
      elBtnDisconnect.disabled = true;
      elProviderSelect.disabled = false;
      elProfileInfo.classList.add('hidden');
      elDocList.innerHTML = '';
    }
  }

  // Connect Handler
  elBtnConnect.addEventListener('click', async () => {
    saveState();
    const providerId = elProviderSelect.value as ProviderId;

    if (providerId === 'local') {
      try {
        log('Connecting to Local provider...');
        await store.connect('local');
        log('Connected to Local provider successfully!', 'success');
        await updateStatusUI();
      } catch (err: any) {
        log(`Connection failed: ${err.message}`, 'error');
      }
      return;
    }

    const clientId = elClientIdInput.value.trim();
    const redirectUri = elRedirectUriInput.value.trim();

    if (!clientId) {
      alert('Please enter a Client ID');
      return;
    }

    // Dynamic Client Configuration based on Provider
    let authEndpoint = '';
    let tokenEndpoint = '';
    let scopes: string[] = [];

    if (providerId === 'google-drive') {
      authEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
      tokenEndpoint = 'https://oauth2.googleapis.com/token';
      scopes = ['https://www.googleapis.com/auth/drive.appdata', 'openid', 'email'];
    } else if (providerId === 'dropbox') {
      authEndpoint = 'https://www.dropbox.com/oauth2/authorize';
      tokenEndpoint = 'https://api.dropboxapi.com/oauth2/token';
      scopes = ['files.content.write', 'files.content.read', 'account_info.read'];
    } else if (providerId === 'onedrive') {
      authEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
      tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
      scopes = ['Files.ReadWrite.AppFolder', 'User.Read', 'offline_access'];
    }

    const config: OAuthProviderConfig = {
      providerId,
      clientId,
      authorizationEndpoint: authEndpoint,
      tokenEndpoint,
      redirectUri,
      scopes,
    };

    const oauthClient = new BrowserOAuthClient({ config });

    // Register active provider factory dynamically
    registry.register({
      id: providerId,
      label: providerId,
      capabilities: ['web', 'pkce-oauth'],
      isSupported: async () => true,
      create: () => {
        if (providerId === 'google-drive') {
          return new GoogleDriveProvider({ auth: oauthClient });
        } else if (providerId === 'dropbox') {
          return new DropboxProvider({ auth: oauthClient });
        } else if (providerId === 'onedrive') {
          return new OneDriveProvider({ auth: oauthClient });
        }
        throw new Error(`Unsupported: ${providerId}`);
      },
    });

    try {
      log(`Initiating OAuth connection flow for ${providerId}...`);
      await store.connect(providerId); // Redirects user
    } catch (err: any) {
      log(`Auth launch failed: ${err.message}`, 'error');
    }
  });

  // Disconnect Handler
  elBtnDisconnect.addEventListener('click', async () => {
    try {
      log('Disconnecting from provider...');
      await store.disconnect();
      log('Disconnected successfully.', 'success');
      await updateStatusUI();
    } catch (err: any) {
      log(`Disconnect failed: ${err.message}`, 'error');
    }
  });

  // CRUD Operations
  elBtnDocGet.addEventListener('click', async () => {
    const key = elDocKeyInput.value.trim();
    if (!key) {
      alert('Please enter a key');
      return;
    }
    await loadDocumentIntoEditor(key);
  });

  elBtnDocPut.addEventListener('click', async () => {
    const key = elDocKeyInput.value.trim();
    const revision = elDocRevisionInput.value.trim();
    const dataRaw = elDocDataTextarea.value.trim();

    if (!key) {
      alert('Please enter a document key');
      return;
    }

    let parsedData = {};
    try {
      parsedData = JSON.parse(dataRaw || '{}');
    } catch (err: any) {
      alert(`Invalid JSON payload: ${err.message}`);
      return;
    }

    try {
      log(`Putting document: ${key}...`);
      const options = revision ? { expectedRevision: revision } : undefined;
      const envelope = await store.put(key, parsedData, options);
      log(`Successfully put document: ${key}`, 'success');
      elDocRevisionInput.value = envelope.revision ?? '';
      refreshDocumentList();
    } catch (err: any) {
      if (err instanceof ConflictError) {
        log(`Conflict detected for key ${key}: ${err.message}`, 'error');
      } else {
        log(`Failed to put document: ${err.message}`, 'error');
      }
    }
  });

  elBtnDocDelete.addEventListener('click', async () => {
    const key = elDocKeyInput.value.trim();
    if (!key) {
      alert('Please enter a key');
      return;
    }
    try {
      log(`Deleting document: ${key}...`);
      await store.delete(key);
      log(`Successfully deleted document: ${key}`, 'success');
      elDocKeyInput.value = '';
      elDocRevisionInput.value = '';
      elDocDataTextarea.value = '';
      refreshDocumentList();
    } catch (err: any) {
      log(`Failed to delete document: ${err.message}`, 'error');
    }
  });

  // Initialization & OAuth Callback Parsing
  async function init() {
    const savedState = loadState();
    elProviderSelect.value = savedState.providerId;
    elClientIdInput.value = savedState.clientId;
    elRedirectUriInput.value = savedState.redirectUri || window.location.origin;
    updateUIFieldVisibility();

    // Check for callback
    const callback = handleCallback();
    if (callback) {
      log('OAuth Callback detected in URI. Completing authentication...', 'info');
      // Clean query parameters from URL
      window.history.replaceState({}, document.title, window.location.pathname);

      const providerId = savedState.providerId;
      const clientId = savedState.clientId;
      const redirectUri = savedState.redirectUri;

      let authEndpoint = '';
      let tokenEndpoint = '';
      let scopes: string[] = [];

      if (providerId === 'google-drive') {
        authEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
        tokenEndpoint = 'https://oauth2.googleapis.com/token';
        scopes = ['https://www.googleapis.com/auth/drive.appdata', 'openid', 'email'];
      } else if (providerId === 'dropbox') {
        authEndpoint = 'https://www.dropbox.com/oauth2/authorize';
        tokenEndpoint = 'https://api.dropboxapi.com/oauth2/token';
        scopes = ['files.content.write', 'files.content.read', 'account_info.read'];
      } else if (providerId === 'onedrive') {
        authEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
        tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
        scopes = ['Files.ReadWrite.AppFolder', 'User.Read', 'offline_access'];
      }

      const config: OAuthProviderConfig = {
        providerId,
        clientId,
        authorizationEndpoint: authEndpoint,
        tokenEndpoint,
        redirectUri,
        scopes,
      };

      const oauthClient = new BrowserOAuthClient({ config });

      // Register the provider
      registry.register({
        id: providerId,
        label: providerId,
        capabilities: ['web', 'pkce-oauth'],
        isSupported: async () => true,
        create: () => {
          if (providerId === 'google-drive') {
            return new GoogleDriveProvider({ auth: oauthClient });
          } else if (providerId === 'dropbox') {
            return new DropboxProvider({ auth: oauthClient });
          } else if (providerId === 'onedrive') {
            return new OneDriveProvider({ auth: oauthClient });
          }
          throw new Error(`Unsupported: ${providerId}`);
        },
      });

      try {
        await oauthClient.completeAuthFlow(callback);
        log('OAuth authentication completed successfully!', 'success');
        
        log(`Connecting store to ${providerId}...`);
        await store.connect(providerId);
        log(`Store connected to ${providerId}`, 'success');
      } catch (err: any) {
        log(`Failed to complete OAuth flow: ${err.message}`, 'error');
      }
    } else {
      // No callback; if provider is 'local', auto-connect for seamless developer usage
      if (savedState.providerId === 'local') {
        try {
          await store.connect('local');
          log('Connected to Local provider successfully.', 'success');
        } catch (err: any) {
          log(`Failed to auto-connect to Local: ${err.message}`, 'error');
        }
      }
    }

    await updateStatusUI();
  }

  // Run initial setup
  init();
  ```

- [ ] **Step 2: Save input event listener**
  Add event listeners to elements to automatically save inputs to `localStorage` when changed:
  ```typescript
  elClientIdInput.addEventListener('input', saveState);
  elRedirectUriInput.addEventListener('input', saveState);
  ```

- [ ] **Step 3: Commit main.ts**
  Run:
  ```bash
  git add apps/playground/src/main.ts
  git commit -m "feat: implement store connection and auth redirect flows"
  ```

---

### Task 5: Integration Check & Concurrency Conflict Testing

- [ ] **Step 1: Check build outputs**
  Check that the project successfully builds inside the turborepo structure:
  Run: `pnpm --filter=@storage-bridge/playground build`
  Expected: Successful production compile of playground bundles.

- [ ] **Step 2: Add script verification instructions**
  Review type-safety of standard declarations to avoid regressions:
  Run: `pnpm --filter=@storage-bridge/playground typecheck`
  Expected: No TypeScript compilation errors.

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git commit --allow-empty -m "test: verify playground compilation and type safety"
  ```

---

### Task 6: Walkthrough & Document

- [ ] **Step 1: Create walkthrough.md**
  Write a summary of changes, screenshot links, and local verification results to `walkthrough.md`.

- [ ] **Step 2: Complete the development**
  Confirm the workspace is clean.
