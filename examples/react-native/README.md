# Storage Bridge React Native Example App

This example application showcases how to integrate `@storage-bridge/core` and `@storage-bridge/auth-react-native` in a React Native Expo application. It supports Local, Google Drive, and OneDrive providers.

## Key Features Demonstrated

- **Native OAuth PKCE Auth Flow**: Integrates with `ReactNativeOAuthClient` and `SecureTokenStore` (using `expo-secure-store` and `expo-auth-session`).
- **Custom Deep Link Callback**: Auto-handles native callbacks from the web-based OAuth flow using the custom scheme `storagebridge://`.
- **Settings Store Sync**: Connects dynamically, lists settings files, and executes CRUD (Get, Put, Delete) operations.
- **Revisions and Conflict Resolution**: Gracefully catches `ConflictError` when the remote revision has changed, matching production patterns.
- **Interactive Log Console**: Renders method execution events chronologically.

---

## Getting Started

### Prerequisites

Ensure you have Node.js, `pnpm`, and `expo-cli` installed.

### Setup and Start

1. Install dependencies from the project root:
   ```bash
   pnpm install
   ```

2. Start the Expo development server:
   ```bash
   pnpm --filter @storage-bridge/example-react-native start
   ```

3. Open the app:
   - **Expo Go (Simulators)**: Press `i` to open in iOS simulator, or `a` to open in Android emulator.
   - **Expo Go (Real Devices)**: Scan the QR code using the Expo Go app (Android) or Camera app (iOS).

---

## Configuring OAuth Clients

To test Google Drive or OneDrive sync:

### 1. Google Drive
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create an **OAuth Client ID** for **iOS** or **Android**.
3. Set the **Redirect URI** to:
   - `exp://localhost:8081` (for local development in simulator)
   - `storagebridge://redirect` (for standalone/production builds)
4. Input the Client ID and Redirect URI in the app settings, then click **Connect Provider**.

### 2. OneDrive
1. Go to the [Microsoft Entra Admin Center / Azure Portal](https://portal.azure.com/).
2. Register an application.
3. In **Authentication**, add a Platform for **Mobile and desktop applications**.
4. Configure redirect URIs:
   - `msauth.com.storagebridge.example://auth`
   - `storagebridge://redirect`
5. Input the Application (client) ID and Redirect URI in the app settings, then click **Connect Provider**.
