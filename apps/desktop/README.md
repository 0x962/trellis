# Trellis desktop

The macOS app uses the existing web renderer and Bun server. The server owns the database. Electron owns the window and native actions.

## Development

Run these commands from the repository root:

```sh
bun install
bun run --cwd apps/desktop build
TRELLIS_DESKTOP_HOME=/tmp/trellis-desktop-dev bun run --cwd apps/desktop dev
```

In development, `TRELLIS_DESKTOP_HOME` selects the host data directory. The packaged app stores its profile in `~/Library/Application Support/Trellis`. Its default database directory is `host` under that profile. Trellis sets its profile directory before it requests the single-instance lock.

Use **Settings > Desktop > Choose data directory** to select an existing home in place. The app and background helper read `selected-home.json` in the profile. The confirmation shows both directories and the backup path. A matching standalone service stops and stays disabled before the desktop opens its database.

The handoff backs up the database before schema migrations. It pauses automation and keeps external agent records intact. External clients need the desktop access token to update tickets. Both data directories retain their files.

On first launch, choose New Trellis data or Use existing directory. An existing directory opens in place after the confirmed handoff.

The host keeps its selected port across restarts. This preserves the renderer origin and its local drafts. A port conflict fails with a link to the host log.

Close a window to detach its view. Quit Trellis to close the desktop process. Both actions keep the host and agents active. Use the Help menu to reconnect to the host or open its logs.

The Desktop section of the Settings page holds the data directory, Open Trellis at login, the background service status, the update status, and the local work actions. **Trellis > Settings…** (Command-comma) opens that section. The menus keep Open Trellis, Stop local work, Quit Trellis, and the Help items. Stop local work and the Help items work when the Settings page cannot load.

The packaged app requests permission to enable its background service. `SMAppService` registers the bundled LaunchAgent. macOS starts it at login and restarts it after a crash. Settings > Desktop shows its status and opens Login Items when approval is required. The separate Open Trellis at login switch controls the desktop window.

In Settings > Desktop, Stop local work and background service pauses local dispatch, stops known local processes, and unregisters the helper. An unknown process prevents the stop. The app waits for the host to exit before it closes. Resume local work allows new local launches. Each project keeps its saved dispatch setting.

The helper reads the user login shell environment with a ten-second limit. It places the bundled executable directory first in PATH. Shell errors omit captured output because startup scripts can expose secrets.

The preload bridge exposes `trellisDesktop.chooseDirectory()` and the Settings calls `status()`, `setOpenAtLogin()`, and `run()`. The main process accepts these calls only from its window at its host origin, and `run()` accepts only the named Settings actions. The renderer uses a sandbox and context isolation. The desktop session adds the host token only to requests from its window to its exact host origin. The token does not enter the renderer.

`trellis://open/t/KEY-1` opens a ticket. External HTTP and HTTPS links open in the system browser.

## Package and verification

```sh
bun run --cwd apps/desktop build
bun run --cwd apps/desktop smoke
bun run --cwd apps/desktop package
```

The staging step copies the server, database worker, migrations, PGlite assets, CLI, web assets, and execution runtime. It includes Bun and Node binaries for the build machine's architecture. The package records a SHA-256 hash for the complete dependency tree, binaries, and relative links. Before host launch, Trellis copies that release into the profile’s `releases` directory. Host processes use these retained files. Links cannot point outside the release.

`smoke` copies the full package into a temporary directory outside the repository. It opens a fresh database and tests authenticated HTTP, web assets, the bundled CLI, the native PTY, and process ownership calls. It also restarts the host and checks that the same PTY remains active.

To test the resources inside a built application:

```sh
bun apps/desktop/scripts/smoke.ts apps/desktop/release/mac-arm64/Trellis.app/Contents/Resources/host
```

`package` creates an unpacked macOS application. `dist:mac` creates DMG and ZIP artifacts. Set the Electron Builder signing and notarization credentials for distribution. A local package can use `CSC_IDENTITY_AUTO_DISCOVERY=false` for an unsigned feasibility check.

## Local preview signature

After you build the app, run this command from the repository root:

```sh
bun apps/desktop/scripts/sign-preview.ts apps/desktop/release/mac-arm64/Trellis.app
```

The command signs native host binaries and the app with the local ad-hoc identity `-`. It recalculates the host release hash before it seals the outer app. It then verifies the nested signatures and the complete app.

This local preview disables hardened runtime through `codesign --options 0`. Ad-hoc binaries have no shared Team ID, so library validation rejects the native modules with hardened runtime enabled. The production entitlement file and Developer ID build settings retain their existing settings. The preview has no Developer ID signature or notarization.

To verify actual Electron startup with an isolated service and data home:

```sh
TRELLIS_DESKTOP_PREVIEW_APP="$PWD/apps/desktop/release/mac-arm64/Trellis.app" bun test apps/desktop/test/int/src/preview/preview.test.ts
```

The test copies the app and uses a unique service label. It redirects the production data path to a scratch directory before any directory creation. It disables protocol registration and answers the fixture's native dialogs. It verifies new data and an existing project in a selected directory. It checks the native title bar and removes the temporary service.

## Manual app replacement

Open Settings > Desktop to read the update status. Before you replace the app, use Stop local work and background service. Replace `Trellis.app`, reopen it, and enable its service. Resume local work when you want to permit new launches. Each project keeps its saved dispatch setting.

The app retains earlier releases. A live execution service with a different protocol blocks the new host. The previous pinned host remains available to stop local work. An unknown service state also blocks activation.

Runtime files stay outside the host database directory, so a database export does not include application binaries. A package replacement does not remove the files of an active runtime. The integration test removes the source app, retains a live PTY, starts another child with the pinned native modules, and restarts the host.

## Release limits

The detached development host has no crash supervisor. The packaged app requires its registered macOS service and does not start an unmanaged replacement.

The isolated launchd integration test verifies helper execution and host crash restart with a temporary label and data home. It removes that service after the test. A second test signs a temporary app with an ad-hoc identity. It registers through `SMAppService`, verifies host crash restart, unregisters, and checks that the host exits. Developer ID signing, notarization, and approval changes through System Settings remain release checks.

The build machine has Apple Development identities but no Developer ID Application identity. Signed distribution and notarization remain unverified. The current package target is the build machine's architecture. Cross-architecture native module builds remain unverified.

Existing browser drafts require an explicit export and import through Settings. The current host must release its database lock before a directory handoff.
