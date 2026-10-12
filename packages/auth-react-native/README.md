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
import { ReactNativeOAuthClient } from '@storage-bridge/auth-react-native';

const client = await ReactNativeOAuthClient.create({
  config, // ReactNativeOAuthConfig (OAuthProviderConfig)
});
```

`create()` resolves the default secure token store from `expo-secure-store`
dynamically; pass an explicit `tokenStore` in the options to plug in a custom
store. Direct construction throws — the client requires secure token
persistence.

See the [root README](../../README.md) for the full documentation.
