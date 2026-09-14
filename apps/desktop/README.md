# Trellis desktop

The macOS app uses the existing web renderer and Bun server. The server owns the database. Electron owns the window and native actions.

## Development

Run these commands from the repository root:

```sh
bun install
bun run --cwd apps/desktop build
TRELLIS_DESKTOP_HOME=/tmp/trellis-desktop-dev bun run --cwd apps/desktop dev
```

In development, `TRELLIS_DESKTOP_HOME` selects the host data directory. Packaged service registration uses the fixed application data directory. The default is the `host` directory inside Electron's application data directory. This release does not import `~/.trellis` automatically.

On first launch, choose New Trellis data or Import existing Trellis data. The import preview shows the source and target paths, file size, ticket counts, and active work blockers. Stop the source host before you import. Trellis requests confirmation before it copies the reviewed source version.

The imported data starts with local work paused and repositories untrusted. Workspace paths still point to their original folders. The import keeps a copy of the files in the new home. If an import fails, the app retains its target and shows an exact command to archive it before another import.

The host keeps its selected port across restarts. This preserves the renderer origin and its local drafts. A port conflict fails with a link to the host log.

Close a window to detach its view. Quit Trellis to close the desktop process. Both actions keep the host and agents active. Use the Help menu to reconnect to the host or open its logs.

The packaged app requests permission to enable its background service. `SMAppService` registers the bundled LaunchAgent. macOS starts it at login and restarts it after a crash. The Trellis menu shows its status and opens Login Items when approval is required. The separate Open Trellis at login option controls the desktop window.

Stop local work and background service pauses local dispatch, stops known local processes, and unregisters the helper. An unknown process prevents the stop. The app waits for the host to exit before it closes. External Superset sessions remain active. Resume local work allows new local launches. Each project keeps its saved dispatch setting.

The helper reads the user login shell environment with a ten-second limit. It places the bundled executable directory first in PATH. Shell errors omit captured output because startup scripts can expose secrets.

The preload bridge exposes only `trellisDesktop.chooseDirectory()`. The renderer uses a sandbox and context isolation. The desktop session adds the host token only to requests from its window to its exact host origin. The token does not enter the renderer.

`trellis://open/t/KEY-1` opens a ticket. External HTTP and HTTPS links open in the system browser.

## Package and verification

```sh
bun run --cwd apps/desktop build
bun run --cwd apps/desktop smoke
bun run --cwd apps/desktop package
```

The staging step copies the server, database worker, migrations, PGlite assets, CLI, web assets, and execution runtime. It includes Bun and Node binaries for the build machine's architecture. The package records a SHA-256 hash for the complete dependency tree, binaries, and relative links. Before host launch, Trellis copies that release into the `releases` directory beside its `host` data directory. Host processes use these retained files. Links cannot point outside the release.

`smoke` opens a fresh database outside the repository. It tests authenticated HTTP, web assets, the bundled CLI, and the native PTY with the bundled Node binary. It also restarts the host and checks that the same PTY remains active.

To test the resources inside a built application:

```sh
bun apps/desktop/scripts/smoke.ts apps/desktop/release/mac-arm64/Trellis.app/Contents/Resources/host
```

`package` creates an unpacked macOS application. `dist:mac` creates DMG and ZIP artifacts. Set the Electron Builder signing and notarization credentials for distribution. A local package can use `CSC_IDENTITY_AUTO_DISCOVERY=false` for an unsigned feasibility check.

## Manual app replacement

Use the Trellis menu to open Update status. Before you replace the app, use Stop local work and background service. Replace `Trellis.app`, reopen it, and enable its service. Resume local work when you want to permit new launches. Each project keeps its saved dispatch setting.

The app retains earlier releases. A live execution service with a different protocol blocks the new host. The previous pinned host remains available to stop local work. An unknown service state also blocks activation.

Runtime files stay outside the host database directory, so a database export does not include application binaries. A package replacement does not remove the files of an active runtime. The integration test removes the source app, retains a live PTY, starts another child with the pinned native modules, and restarts the host.

## Release limits

The detached development host has no crash supervisor. The packaged app requires its registered macOS service and does not start an unmanaged replacement.

The isolated launchd integration test verifies helper execution and host crash restart with a temporary label and data home. It removes that service after the test. A second test signs a temporary app with an ad-hoc identity. It registers through `SMAppService`, verifies host crash restart, unregisters, and checks that the host exits. Developer ID signing, notarization, and approval changes through System Settings remain release checks.

The build machine has Apple Development identities but no Developer ID Application identity. Signed distribution and notarization remain unverified. The current package target is the build machine's architecture. Cross-architecture native module builds remain unverified.

Existing browser drafts require an explicit export and import. The old server must release its database lock before the desktop can copy its data home.
