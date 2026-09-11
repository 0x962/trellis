# trellis on a phone

The app runs in Expo Go. Expo Go is one prebuilt binary per SDK, so it holds
the native code of the modules in `node_modules/expo/bundledNativeModules.json`
and nothing else. Every dependency of this app is in that list, so no build
step stands between a change and the phone.

## Open the app on the phone

Install Expo Go from the App Store first. Put the phone and this Mac on the
same tailnet.

### 1. Start Metro on the Tailscale hostname

Metro prints a URL that the phone has to reach. `localhost` is not such a URL,
so the packager hostname is the Tailscale name of this Mac.

```sh
REACT_NATIVE_PACKAGER_HOSTNAME=navids-mac-mini.tail4a5b4c.ts.net bunx expo start
```

Run `tailscale status --json` and read `Self.DNSName` for the name of another
machine.

### 2. Scan the QR code with Expo Go

Metro prints a QR code in the terminal. Open Expo Go on the phone and scan it.
Expo Go downloads the bundle from Metro and starts the app. A fresh install
opens the Server screen.

### 3. Enter the trellis server URL

Type the URL of the trellis server into the Server field:

```
https://canary-jqv57w1hpl.tail4a5b4c.ts.net
```

Press **Test connection**. The screen shows the server version, the ticket
count, and the name the server gives you. Type your name into the Name field
and press **Save**. The four tabs appear.

The app keeps the URL, the name, the theme, and the query cache in
`expo-sqlite/kv-store`, so it opens on that server the next time.

## Checks

| command | proves |
|---|---|
| `bun run test` | the bun suite, against a real server in process |
| `bun run test:native` | the jest-expo component suite |
| `bun run typecheck` | the types |
| `bunx expo export --platform ios` | Metro bundles the app for iOS |
| `bunx expo install --check` | every dependency matches the SDK |
