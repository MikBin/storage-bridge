import {
  LocalDocumentStoreProvider,
  ProviderRegistry,
  DefaultSettingsStore,
  ProviderId,
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

elClientIdInput.addEventListener('input', saveState);
elRedirectUriInput.addEventListener('input', saveState);

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
