# @storage-bridge/auth-react-native

React Native (Expo) OAuth 2.0 + PKCE authentication adapter for Storage
Bridge: deep-link callback handling, `SecureStore`-backed token storage, and
an `OAuthClient` that plugs into the core `TokenManager`.

## Install

```sh
pnpm add @storage-bridge/auth-react-native
```

## Usage

```ts
import { ReactNativeOAuthClient, SecureTokenStore } from '@storage-bridge/auth-react-native';

const client = new ReactNativeOAuthClient({
  config, // ReactNativeOAuthConfig (OAuthProviderConfig)
  tokenStore: new SecureTokenStore(),
});
```

See the [root README](../../README.md) for the full documentation.
