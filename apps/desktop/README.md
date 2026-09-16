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

Use **Trellis > Restart** to restart the host and desktop from the installed package. Compatible agents keep their processes and terminal output. If the packaged app detects an incompatible or unknown runtime, it blocks the restart and shows the reason.

A local progress window shows a progress bar, numbered steps, and estimated time remaining. Estimates use the durations of previous runs. The step count continues across the desktop relaunch. The window fades out when the main window opens.

The packaged app enables its background service at startup. `SMAppService` registers the bundled LaunchAgent. macOS starts it at login and restarts it after a crash. Settings > Desktop shows its status and opens Login Items when approval is required. The separate Open Trellis at login switch controls the desktop window.

In Settings > Desktop, Stop local work and background service pauses local dispatch, stops known local processes, and unregisters the helper. An unknown process prevents the stop. The app waits for the host to exit before it closes. Resume local work allows new local launches. Each project keeps its saved dispatch setting.

The host starts HTTP before it resolves the user login environment. External tools await the cached environment in their server thread. The shell has a ten-second limit. The bundled executable directory comes first in PATH. Shell errors omit captured output because startup scripts can expose secrets.

The preload bridge exposes `trellisDesktop.chooseDirectory()`, the Settings calls, and the route listener. The main process accepts the Settings calls only from its window at its host origin. `run()` accepts only the named Settings actions. The renderer uses a sandbox and context isolation. The desktop session adds the host token only to requests from its window to its exact host origin. The token does not enter the renderer.

`trellis://open/t/KEY-1` opens a ticket. External HTTP and HTTPS links open in the system browser.

Use **Trellis > Restart** to load the installed package. A changed package stops active agent processes and resumes their saved provider conversations. An unchanged package keeps those processes. An agent without a confirmed provider session blocks the update and shows the reason.

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

## Production install

Commit the source changes. Run this command from the repository root:

```sh
bun run desktop:install
```

The command rejects uncommitted changes. It exports one commit into a fresh directory and installs the frozen dependency lockfile. It builds the renderer, runtime, harnesses, desktop, and complete host package. It records the commit in `build.json`. Electron downloads use `~/Library/Caches/Trellis` across builds.

The command signs the local package and runs the packaged smoke checks. It copies the app with `ditto` into a temporary directory beside `~/Applications/Trellis.app` and verifies that copy. It publishes the copy through an atomic directory exchange when an installed app exists. Deleted source files cannot remain in the installed bundle. The running app and its services stay open during the copy.

Use this command for each production install. Keep the installed bundle in place until the verified copy is complete. Run service commands through `~/Applications/Trellis.app/Contents/MacOS/TrellisHost`. The helper requires the LaunchAgent plist inside its app bundle.

Restart Trellis to activate the installed build. For a changed package, Trellis saves the confirmed active agent sessions before it stops the previous runtime. After the new host starts, Trellis resumes those provider sessions in their saved workspaces. Agents that you stopped stay stopped. An unchanged package keeps the existing processes.

Trellis stores pending resumes in `restart-plan.json` inside the selected data directory. A failed activation preserves this plan for the next app launch. Each saved attempt has one resume identity, which prevents duplicate processes and restart messages. A later package must complete any partial resume before it stops another runtime.

A custom agent or an agent without a confirmed provider session blocks the update before runtime shutdown. Stop that agent, or wait for its provider session, then reopen Trellis.

To prepare a verified candidate without a production install:

```sh
bun run desktop:install --prepare /tmp/trellis-preview/Trellis.app
```

This command uses the local ad-hoc signature described above. It requires Node, npm, the macOS developer tools, and network access for dependencies. A failed build leaves its temporary directory for inspection.

The app retains earlier releases. The release identity includes the desktop launcher, preload bridge, service launcher, native helper, and LaunchAgent configuration. An unknown service state blocks activation.

Runtime files stay outside the host database directory, so a database export does not include application binaries. A package replacement does not remove the files of an active runtime. The integration test removes the source app, retains a live PTY, starts another child with the pinned native modules, and restarts the host.

### Fresh manager conversation

Save your prompt changes. Open the project's Manager page. Select **Restart with new context** beside the process control. Confirm the restart. The manager starts a fresh conversation with the saved persona and project instructions. Existing workers keep their processes, and the manager keeps its workspace.

Use **Resume manager** to continue the current conversation after a manual stop. A desktop app restart also preserves the current conversation.

## Release limits

The detached development host has no crash supervisor. The packaged app requires its registered macOS service and does not start an unmanaged replacement.

The isolated launchd integration test verifies helper execution and host crash restart with a temporary label and data home. It removes that service after the test. A second test signs a temporary app with an ad-hoc identity. It registers through `SMAppService`, verifies host crash restart, unregisters, and checks that the host exits. Developer ID signing, notarization, and approval changes through System Settings remain release checks.

The build machine has Apple Development identities but no Developer ID Application identity. Signed distribution and notarization remain unverified. The current package target is the build machine's architecture. Cross-architecture native module builds remain unverified.

Existing browser drafts require an explicit export and import through Settings. The current host must release its database lock before a directory handoff.
