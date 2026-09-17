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

The Desktop section of the Settings page holds the data directory, Open Trellis at login, the background service status, the update status, and the host controls. **Trellis > Settings…** (Command-comma) opens that section. The menus keep Open Trellis, Quit Trellis, Quit Trellis Completely, and the Help items. Quit Trellis Completely and the Help items work when the Settings page cannot load.

Use **Trellis > Restart** to restart the host and desktop from the installed package. Compatible agents keep their processes and terminal output. If the packaged app detects an incompatible or unknown runtime, it blocks the restart and shows the reason.

A local progress window shows a progress bar, numbered steps, and estimated time remaining. Estimates use the durations of previous runs. The step count continues across the desktop relaunch. The window fades out when the main window opens.

The packaged app enables its background service at startup. `SMAppService` registers the bundled LaunchAgent. macOS starts it at login and restarts it after a crash. Settings > Desktop shows its status and opens Login Items when approval is required. The separate Open Trellis at login switch controls the desktop window.

In Settings > Desktop, Quit Trellis Completely stops known local processes and unregisters the helper. An unknown process prevents the stop. The app waits for the host to exit before it closes. Open Trellis to start the helper and deterministic manager.

Project settings select the repository directory. A blank child directory uses the nearest ancestor with a configured directory. Trellis trusts configured repositories and agent workspaces.

The host starts HTTP before it resolves the user login environment. External tools await the cached environment in their server thread. The shell has a ten-second limit. The bundled executable directory comes first in PATH. Shell errors omit captured output because startup scripts can expose secrets.

The preload bridge exposes `trellisDesktop.chooseDirectory()`, the Settings calls, and the route listener. The main process accepts the Settings calls only from its window at its host origin. `run()` accepts only the named Settings actions. The renderer uses a sandbox and context isolation. The desktop session adds the host token only to requests from its window to its exact host origin. The token does not enter the renderer.

`trellis://open/t/KEY-1` opens a ticket. External HTTP and HTTPS links open in the system browser.

Use **Trellis > Restart** to load the installed package. A changed package stops the previous runtime. The deterministic manager starts column workers and project copilots with their current settings. Compatible conversations and workspaces persist.

## Package

```sh
bun run --cwd apps/desktop build
bun run --cwd apps/desktop package
```

The staging step copies the server, database worker, migrations, PGlite assets, CLI, web assets, and execution runtime. It includes Bun and Node binaries for the build machine's architecture. The package records a SHA-256 hash for the complete dependency tree, binaries, and relative links. Before host launch, Trellis copies that release into the profile’s `releases` directory. Host processes use these retained files. Links cannot point outside the release.

`package` creates an unpacked macOS application. `dist:mac` creates DMG and ZIP artifacts. Set the Electron Builder signing and notarization credentials for distribution. A local package can use `CSC_IDENTITY_AUTO_DISCOVERY=false` for an unsigned feasibility check.

## Local preview signature

After you build the app, run this command from the repository root:

```sh
bun apps/desktop/scripts/sign-preview.ts apps/desktop/release/mac-arm64/Trellis.app
```

The command signs native host binaries and the app with the local ad-hoc identity `-`. It recalculates the host release hash before it seals the outer app. It then verifies the nested signatures and the complete app.

This local preview disables hardened runtime through `codesign --options 0`. Ad-hoc binaries have no shared Team ID, so library validation rejects the native modules with hardened runtime enabled. The production entitlement file and Developer ID build settings retain their existing settings. The preview has no Developer ID signature or notarization.

## Production install

The Trellis SRE persona owns release batches for the TRL project.
The manager assigns one SRE to all eligible Deploy Queue tickets, with one build, install, and restart for the batch.
The SRE saves a release checkpoint before restart and verifies restored sessions afterward.

Merge the source changes into `main`. Push `main` to `origin`. Run this command from a clean `main` checkout at the current `origin/main` commit:

```sh
bun run desktop:install
```

The command rejects uncommitted changes, feature branches, detached commits, and a `main` checkout that differs from the refreshed `origin/main`. These requirements also apply to `--prepare` candidates. Do not bypass the production installer.

The candidate must include the installed app's source commit. The installer checks this before the build and before publication. A macOS advisory lock permits one publication at a time.

The command exports one commit into a fresh directory and installs the frozen dependency lockfile. It builds the renderer, runtime, harnesses, desktop, and complete host package. It records the commit in `build.json`. Electron downloads use `~/Library/Caches/Trellis` across builds.

The command signs the local package. It copies the app with `ditto` into a temporary directory beside `~/Applications/Trellis.app` and verifies its signature. It publishes the copy through an atomic directory exchange when an installed app exists. Deleted source files cannot remain in the installed bundle. The running app and its services stay open during the copy.

Use this command for each production install. Keep the installed bundle in place until the verified copy is complete. Run service commands through `~/Applications/Trellis.app/Contents/MacOS/TrellisHost`. The helper requires the LaunchAgent plist inside its app bundle.

Restart Trellis to activate the installed build. A changed package stops the previous runtime and starts the new host. The deterministic manager starts configured column workers and project copilots on its next beat. It resumes compatible conversations in their saved workspaces. An unchanged package keeps existing processes.

To prepare a verified candidate without a production install:

```sh
bun run desktop:install --prepare /tmp/trellis-preview/Trellis.app
```

This command uses the local ad-hoc signature described above. It requires Node, npm, the macOS developer tools, and network access for dependencies. A failed build leaves its temporary directory for inspection.

The app retains earlier releases. The release identity includes the desktop launcher, preload bridge, service launcher, native helper, and LaunchAgent configuration. An unknown service state blocks activation.

Runtime files stay outside the host database directory, so a database export does not include application binaries. A package replacement does not remove the files of an active runtime. The integration test removes the source app, retains a live PTY, starts another child with the pinned native modules, and restarts the host.

### Project copilots

Trellis keeps one copilot available for each active project. A copilot acts on user instructions.
Project settings select its persona and harness. New starts and restarts read the saved settings.
A compatible restart preserves the copilot conversation.
Column settings control automatic ticket workers, including recovery after a stop or failure.

## Release limits

The detached development host has no crash supervisor. The packaged app requires its registered macOS service and does not start an unmanaged replacement.

The build machine has Apple Development identities but no Developer ID Application identity. Signed distribution and notarization remain unverified. The current package target is the build machine's architecture. Cross-architecture native module builds remain unverified.

The current host must release its database lock before a directory handoff.
