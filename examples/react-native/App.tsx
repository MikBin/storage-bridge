import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {
  LocalDocumentStoreProvider,
  ProviderRegistry,
  DefaultSettingsStore,
  ProviderId,
  ConflictError,
  SettingsSummary,
} from '@storage-bridge/core';
import {
  ReactNativeOAuthClient,
  SecureTokenStore,
} from '@storage-bridge/auth-react-native';
import { GoogleDriveProvider } from '@storage-bridge/provider-google-drive';
import { OneDriveProvider } from '@storage-bridge/provider-onedrive';

// Instantiate core Registry and Store outside component context for stability
const registry = new ProviderRegistry();
const store = new DefaultSettingsStore(registry);

// Pre-register Local provider
registry.register({
  id: 'local',
  label: 'Local (In-Memory)',
  capabilities: ['offline-cache', 'react-native'],
  isSupported: async () => true,
  create: () => new LocalDocumentStoreProvider(),
});

interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export default function App() {
  // Connection Configuration State
  const [providerId, setProviderId] = useState<ProviderId>('local');
  const [clientId, setClientId] = useState('');
  const [redirectUri, setRedirectUri] = useState('storagebridge://redirect');
  const [isConnected, setIsConnected] = useState(false);
  const [profile, setProfile] = useState<{ accountId?: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Document Management State
  const [docKey, setDocKey] = useState('preferences');
  const [docRevision, setDocRevision] = useState('');
  const [docData, setDocData] = useState('{\n  "theme": "dark",\n  "notifications": true\n}');
  const [documents, setDocuments] = useState<SettingsSummary[]>([]);

  // Logging Console State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsScrollViewRef = useRef<ScrollView>(null);

  // Helper log function
  const addLog = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString();
    const id = Math.random().toString(36).substring(2, 9);
    setLogs((prev) => [...prev, { id, time, message, type }]);
  }, []);

  // Auto-scroll log console to bottom
  useEffect(() => {
    if (logsScrollViewRef.current) {
      setTimeout(() => {
        logsScrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [logs]);

  // List all keys
  const refreshDocuments = useCallback(async () => {
    try {
      addLog('Listing documents...', 'info');
      const list = await store.list();
      setDocuments(list);
      addLog(`Found ${list.length} documents.`, 'success');
    } catch (err) {
      addLog(`List failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, [addLog]);

  // Sync connection status from storage manager
  const checkConnectionStatus = useCallback(async () => {
    try {
      const connected = await store.isConnected();
      setIsConnected(connected);
      if (connected) {
        const userProfile = await store.getProfile();
        setProfile(userProfile ? { accountId: userProfile.accountId, email: userProfile.email } : null);
        addLog('Store connected state verified.', 'info');
        await refreshDocuments();
      } else {
        setProfile(null);
        setDocuments([]);
      }
    } catch (err) {
      addLog(`Failed checking connection: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, [addLog, refreshDocuments]);

  // Initial auto-connect local or state check
  useEffect(() => {
    addLog('Storage Bridge Initialized. Auto-connecting local...', 'info');
    store.connect('local')
      .then(() => {
        addLog('Connected to Local provider.', 'success');
        checkConnectionStatus();
      })
      .catch((err) => {
        addLog(`Auto-connect local failed: ${err.message}`, 'error');
      });
  }, [checkConnectionStatus, addLog]);

  // Perform Connection
  const handleConnect = async () => {
    if (providerId === 'local') {
      try {
        setLoading(true);
        addLog('Connecting to Local...', 'info');
        await store.connect('local');
        addLog('Local provider connected successfully.', 'success');
        await checkConnectionStatus();
      } catch (err) {
        addLog(`Local connect failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!clientId.trim()) {
      Alert.alert('Configuration Missing', 'Please enter your Client ID.');
      return;
    }

    try {
      setLoading(true);
      addLog(`Setting up ${providerId} provider...`, 'info');

      // Configuration of OAuth scopes/endpoints
      let authEndpoint = '';
      let tokenEndpoint = '';
      let scopes: string[] = [];

      if (providerId === 'google-drive') {
        authEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
        tokenEndpoint = 'https://oauth2.googleapis.com/token';
        scopes = ['https://www.googleapis.com/auth/drive.appdata', 'openid', 'email'];
      } else if (providerId === 'onedrive') {
        authEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
        tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
        scopes = ['Files.ReadWrite.AppFolder', 'User.Read', 'offline_access'];
      }

      // Configure OAuth client with SecureTokenStore
      const oauthClient = new ReactNativeOAuthClient({
        config: {
          providerId,
          clientId: clientId.trim(),
          authorizationEndpoint: authEndpoint,
          tokenEndpoint,
          redirectUri,
          scopes,
        },
        tokenStore: new SecureTokenStore(),
      });

      // Register the provider dynamically
      registry.register({
        id: providerId,
        label: providerId === 'google-drive' ? 'Google Drive' : 'OneDrive',
        capabilities: ['react-native', 'pkce-oauth'],
        isSupported: async () => true,
        create: () => {
          if (providerId === 'google-drive') {
            return new GoogleDriveProvider({ auth: oauthClient });
          } else {
            return new OneDriveProvider({ auth: oauthClient });
          }
        },
      });

      addLog('Initiating native OAuth flow...', 'info');
      await store.connect(providerId);
      addLog(`${providerId} connected successfully!`, 'success');
      await checkConnectionStatus();
    } catch (err) {
      addLog(`Connection failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      Alert.alert('Connection Failed', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Perform Disconnect
  const handleDisconnect = async () => {
    try {
      setLoading(true);
      addLog('Disconnecting from provider...', 'info');
      await store.disconnect();
      addLog('Disconnected successfully.', 'success');
      await checkConnectionStatus();
    } catch (err) {
      addLog(`Disconnect failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // CRUD Settings Operations
  const handleGet = async (key: string = docKey) => {
    if (!key.trim()) {
      Alert.alert('Input Missing', 'Please enter a key.');
      return;
    }
    try {
      addLog(`Fetching key: "${key}"...`, 'info');
      const envelope = await store.get<unknown>(key);
      if (envelope) {
        setDocKey(envelope.key);
        setDocRevision(envelope.revision ?? '');
        setDocData(JSON.stringify(envelope.data, null, 2));
        addLog(`Fetched "${key}" successfully (revision: ${envelope.revision ?? 'none'}).`, 'success');
      } else {
        addLog(`Key "${key}" not found.`, 'info');
        Alert.alert('Not Found', `No document exists for key "${key}"`);
      }
    } catch (err) {
      addLog(`Get failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const handlePut = async () => {
    if (!docKey.trim()) {
      Alert.alert('Input Missing', 'Please enter a key.');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(docData);
    } catch {
      Alert.alert('Invalid JSON', 'Please correct the document JSON formatting.');
      return;
    }

    try {
      addLog(`Saving document "${docKey}"...`, 'info');
      const options = docRevision.trim() ? { expectedRevision: docRevision.trim() } : undefined;
      const envelope = await store.put(docKey, parsed, options);
      setDocRevision(envelope.revision ?? '');
      addLog(`Saved "${docKey}" (New revision: ${envelope.revision ?? 'none'}).`, 'success');
      await refreshDocuments();
    } catch (err) {
      if (err instanceof ConflictError) {
        addLog(`Conflict Error: ${err.message}`, 'error');
        Alert.alert('Sync Conflict', 'A newer version exists. Fetch the latest and try again.');
      } else {
        addLog(`Put failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    }
  };

  const handleDelete = async (key: string = docKey) => {
    if (!key.trim()) {
      Alert.alert('Input Missing', 'Please enter a key.');
      return;
    }
    try {
      addLog(`Deleting key: "${key}"...`, 'info');
      await store.delete(key);
      if (key === docKey) {
        setDocRevision('');
        setDocData('{}');
      }
      addLog(`Deleted "${key}" successfully.`, 'success');
      await refreshDocuments();
    } catch (err) {
      addLog(`Delete failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Storage Bridge Mobile</Text>
        <View style={[styles.statusBadge, isConnected ? styles.badgeConnected : styles.badgeDisconnected]}>
          <Text style={styles.statusText}>{isConnected ? 'Connected' : 'Disconnected'}</Text>
        </View>
      </View>

      <ScrollView style={styles.mainScroll} contentContainerStyle={styles.scrollContent}>
        {/* Connection Setup Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Connection Settings</Text>
          
          <Text style={styles.label}>Select Provider</Text>
          <View style={styles.pickerContainer}>
            {(['local', 'google-drive', 'onedrive'] as const).map((id) => (
              <TouchableOpacity
                key={id}
                style={[styles.pickerButton, providerId === id && styles.pickerButtonActive]}
                disabled={isConnected}
                onPress={() => setProviderId(id)}
              >
                <Text style={[styles.pickerButtonText, providerId === id && styles.pickerButtonTextActive]}>
                  {id === 'local' ? 'Local' : id === 'google-drive' ? 'Google' : 'OneDrive'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {providerId !== 'local' && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>OAuth Client ID</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter client ID"
                placeholderTextColor="#666"
                value={clientId}
                onChangeText={setClientId}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isConnected}
              />
              <Text style={styles.label}>Redirect URI</Text>
              <TextInput
                style={styles.input}
                placeholder="Redirect URI"
                placeholderTextColor="#666"
                value={redirectUri}
                onChangeText={setRedirectUri}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isConnected}
              />
            </View>
          )}

          {isConnected && profile && (
            <View style={styles.profileBox}>
              <Text style={styles.profileLabel}>Connected Account ID:</Text>
              <Text style={styles.profileValue}>{profile.accountId}</Text>
              {profile.email && (
                <>
                  <Text style={styles.profileLabel}>Account Email:</Text>
                  <Text style={styles.profileValue}>{profile.email}</Text>
                </>
              )}
            </View>
          )}

          {loading ? (
            <ActivityIndicator size="small" color="#007aff" style={{ marginVertical: 10 }} />
          ) : !isConnected ? (
            <TouchableOpacity style={styles.btnPrimary} onPress={handleConnect}>
              <Text style={styles.btnText}>Connect Provider</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.btnDanger} onPress={handleDisconnect}>
              <Text style={styles.btnText}>Disconnect</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Document Editor Card */}
        {isConnected && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>2. Document Editor</Text>

            <Text style={styles.label}>Document Settings Key</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. preferences"
              placeholderTextColor="#666"
              value={docKey}
              onChangeText={setDocKey}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Current Revision (Read-Only)</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={docRevision || '(new document)'}
              editable={false}
            />

            <Text style={styles.label}>Document Content (JSON)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={docData}
              onChangeText={setDocData}
              multiline
              numberOfLines={6}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.row}>
              <TouchableOpacity style={[styles.btnSecondary, styles.flex1]} onPress={() => handleGet()}>
                <Text style={styles.btnSecondaryText}>Fetch</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, styles.flex1, { marginHorizontal: 8 }]} onPress={handlePut}>
                <Text style={styles.btnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnDanger, styles.flex1]} onPress={() => handleDelete()}>
                <Text style={styles.btnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Settings Index Card */}
        {isConnected && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>3. Saved Settings Files</Text>
            <TouchableOpacity style={styles.btnSecondary} onPress={refreshDocuments}>
              <Text style={styles.btnSecondaryText}>Refresh File List</Text>
            </TouchableOpacity>
            
            {documents.length === 0 ? (
              <Text style={styles.emptyText}>No documents stored yet.</Text>
            ) : (
              documents.map((doc) => (
                <View key={doc.key} style={styles.docRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.docKeyText}>{doc.key}</Text>
                    <Text style={styles.docRevisionText}>Rev: {doc.revision ?? 'none'}</Text>
                  </View>
                  <View style={styles.row}>
                    <TouchableOpacity style={styles.actionIconBtn} onPress={() => handleGet(doc.key)}>
                      <Text style={styles.actionIconText}>Fetch</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionIconBtn, { marginLeft: 8 }]} onPress={() => handleDelete(doc.key)}>
                      <Text style={styles.actionIconTextRed}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Scrollable Debug Log Panel */}
        <View style={styles.card}>
          <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 10 }]}>
            <Text style={styles.cardTitle}>Execution Console Log</Text>
            <TouchableOpacity onPress={() => setLogs([])}>
              <Text style={styles.clearLogsText}>Clear</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={logsScrollViewRef}
            style={styles.logsConsole}
            contentContainerStyle={{ padding: 8 }}
            nestedScrollEnabled
          >
            {logs.length === 0 ? (
              <Text style={styles.logEmptyText}>Terminal ready. Logs will appear here...</Text>
            ) : (
              logs.map((log) => (
                <View key={log.id} style={styles.logRow}>
                  <Text style={styles.logTimeText}>[{log.time}] </Text>
                  <Text
                    style={[
                      styles.logMessageText,
                      log.type === 'success' && styles.logSuccess,
                      log.type === 'error' && styles.logError,
                    ]}
                  >
                    {log.message}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#161616',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeConnected: {
    backgroundColor: '#1c3d25',
  },
  badgeDisconnected: {
    backgroundColor: '#3d1c1c',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  mainScroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2d2d2d',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  label: {
    color: '#999',
    fontSize: 12,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#262626',
    color: '#fff',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 8,
  },
  inputDisabled: {
    backgroundColor: '#161616',
    color: '#666',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  pickerContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  pickerButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#262626',
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  pickerButtonActive: {
    backgroundColor: '#007aff',
    borderColor: '#007aff',
  },
  pickerButtonText: {
    color: '#999',
    fontSize: 13,
    fontWeight: '600',
  },
  pickerButtonTextActive: {
    color: '#fff',
  },
  formGroup: {
    marginTop: 8,
  },
  btnPrimary: {
    backgroundColor: '#007aff',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 12,
  },
  btnSecondary: {
    backgroundColor: '#2d2d2d',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a3a3a',
    marginTop: 12,
  },
  btnSecondaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  btnDanger: {
    backgroundColor: '#ff3b30',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 12,
  },
  btnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex1: {
    flex: 1,
  },
  profileBox: {
    backgroundColor: '#222',
    padding: 10,
    borderRadius: 6,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  profileLabel: {
    color: '#666',
    fontSize: 11,
    fontWeight: '600',
  },
  profileValue: {
    color: '#007aff',
    fontSize: 13,
    marginBottom: 6,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 13,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222',
    padding: 10,
    borderRadius: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2d2d2d',
  },
  docKeyText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  docRevisionText: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  actionIconBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#2d2d2d',
    borderRadius: 4,
  },
  actionIconText: {
    color: '#007aff',
    fontSize: 12,
    fontWeight: '600',
  },
  actionIconTextRed: {
    color: '#ff3b30',
    fontSize: 12,
    fontWeight: '600',
  },
  logsConsole: {
    height: 150,
    backgroundColor: '#0a0a0a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#222',
  },
  clearLogsText: {
    color: '#007aff',
    fontSize: 12,
  },
  logEmptyText: {
    color: '#444',
    fontStyle: 'italic',
    fontSize: 11,
  },
  logRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  logTimeText: {
    color: '#555',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  logMessageText: {
    flex: 1,
    color: '#ccc',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  logSuccess: {
    color: '#34c759',
  },
  logError: {
    color: '#ff3b30',
  },
});
