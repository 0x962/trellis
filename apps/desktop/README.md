# Trellis desktop

The macOS app uses the existing web renderer and Bun server. The server owns the database. Electron owns the window and native actions.

## Development

Run these commands from the repository root:

```sh
bun install
bun run --cwd apps/desktop build
TRELLIS_DESKTOP_HOME=/tmp/trellis-desktop-dev bun run --cwd apps/desktop dev
```

`TRELLIS_DESKTOP_HOME` selects the host data directory. The default is the `host` directory inside Electron's application data directory. This release does not import `~/.trellis` automatically.

The host keeps its selected port across restarts. This preserves the renderer origin and its local drafts. A port conflict fails with a link to the host log.

Close a window to detach its view. Quit Trellis to close the desktop process. Both actions keep the host and agents active. Use the Help menu to reconnect to the host or open its logs.

The preload bridge exposes only `trellisDesktop.chooseDirectory()`. The renderer uses a sandbox and context isolation. The desktop session adds the host token only to requests from its window to its exact host origin. The token does not enter the renderer.

`trellis://open/t/KEY-1` opens a ticket. External HTTP and HTTPS links open in the system browser.

## Package and verification

```sh
bun run --cwd apps/desktop build
bun run --cwd apps/desktop smoke
bun run --cwd apps/desktop package
```

The staging step copies the server, database worker, migrations, PGlite assets, CLI, web assets, and execution runtime. It includes Bun and Node binaries for the build machine's architecture. The dependency tree remains inside the application resources.

`smoke` opens a fresh database outside the repository. It tests authenticated HTTP, web assets, the bundled CLI, and the native PTY with the bundled Node binary. It also restarts the host and checks that the same PTY remains active.

To test the resources inside a built application:

```sh
bun apps/desktop/scripts/smoke.ts apps/desktop/release/mac-arm64/Trellis.app/Contents/Resources/host
```

`package` creates an unpacked macOS application. `dist:mac` creates DMG and ZIP artifacts. Set the Electron Builder signing and notarization credentials for distribution. A local package can use `CSC_IDENTITY_AUTO_DISCOVERY=false` for an unsigned feasibility check.

## Release limits

The current package does not register a login helper, restart the host after logout, or apply updates. Detached processes survive a window close and desktop quit. They do not establish a login service.

The build machine has Apple Development identities but no Developer ID Application identity. Signed distribution and notarization remain unverified. The current package target is the build machine's architecture. Cross-architecture native module builds remain unverified.

The desktop uses a separate data home until the controlled service migration is complete. Existing browser drafts require an explicit export and import. The old server must release its database lock before desktop migration can open that data home.
