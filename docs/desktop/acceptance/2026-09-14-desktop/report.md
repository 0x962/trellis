# Desktop acceptance, 2026-09-14

The macOS arm64 preview passes 17 desktop integration tests and eight package smoke checks after runtime fix `07077d79`. These checks use temporary data homes and temporary service labels. The production Trellis home and service remain unchanged.

## Package

- Artifact: `apps/desktop/release/mac-arm64/Trellis.app`
- Bundle icon: `icon.icns`, byte-for-byte match with `apps/desktop/build/icon.icns`.
- Icon SHA-256: `789f98732ff836decfc657f9849f916898d6d43ee58ee057da308265186150a0`
- Runtime protocol: `5`
- Host release SHA-256: `7b9a1cbe8fd516128d28a4633aafd7a525dc233266450da4b45eca56e249a428`
- Runtime dependencies: 61 packages, including Koffi `3.3.0` and `@koromix/koffi-darwin-arm64`.
- Executables: Bun `1.3.13`, Node `26.8.2`, Electron `44.3.0`.
- Build command: `bun run --cwd apps/desktop build`
- Package command, from `apps/desktop`: `CSC_IDENTITY_AUTO_DISCOVERY=false bunx electron-builder --config electron-builder.json --config.electronDownload.cache=/tmp/trellis-electron-cache --mac --dir`

The packaged host files match their recorded release hash. The smoke command copies those files outside the checkout before it starts any process. This prevents Node from resolving missing dependencies through the checkout.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Desktop units | 12 pass, 42 assertions | `bun run --cwd apps/desktop test` |
| Desktop types | Pass | `bun run --cwd apps/desktop typecheck` |
| Desktop integrations | 17 pass, 84 assertions | [Integration log](trellis-desktop-final-tests.log) |
| Packaged resource hash | Match, protocol 5 | [Hash result](trellis-desktop-final-hash.log) |
| Package smoke | 8 pass | [Smoke result](trellis-desktop-final-smoke.log) |

The final rebuild includes the closed-input fix and retains protocol 5. The package still contains 61 dependencies. The full desktop suite and package smoke run after the fix. The [runtime input report](runtime-input.md) records the focused runtime and server checks.

The integration suite covers cold host adoption, the sandboxed preload, first-launch import, Cancel, login shell environment, and stop sequencing. It also verifies launchd crash restart and registration through `SMAppService` with a temporary ad-hoc signed app. Both temporary services are removed.

The resource test removes the source app while a PTY remains active. A second child loads node-pty, fs-ext, and Koffi from the retained files. The same runtime and first PTY survive a host restart.

The package smoke verifies the database worker, host authentication, renderer assets, CLI, PTY, native process ownership call, PTY survival, and stable origin.

## Signed local preview

The local artifact has an ad-hoc signature, identifier `com.trellis.desktop`, and no Team ID. Its signing flags are `0x2(adhoc)`. This command signs 15 native host binaries, recalculates the host hash, and seals the outer app:

```sh
bun apps/desktop/scripts/sign-preview.ts apps/desktop/release/mac-arm64/Trellis.app
```

The script uses `codesign --options 0` for the local preview. Hardened runtime with an ad-hoc identity rejects Node native modules and Electron Framework with a different-Team-ID error. The production entitlement file and Developer ID settings remain unchanged.

`codesign --verify --deep --strict` passes on the app. Separate signature verification passes on the bundled helper and all 15 host binaries. The eight smoke checks use the signed resources after the final seal.

The actual Electron test extracts the copied app's own `app.asar`. It replaces the service label and disables protocol registration. It answers only the fixture's first-launch and service prompts. It redirects the intended data path before any directory creation and calls the native path setter with the scratch directory.

The test exposes a real startup defect before the fix: Electron keeps `Library/Application Support/@trellis/desktop` after `setName`. The helper expects `Library/Application Support/Trellis`. The fixed app explicitly creates and sets that path before it requests its single-instance lock.

The final test records the intended path as `/Users/navidkhan/Library/Application Support/Trellis` and the call order as `["data", "lock"]`. The isolated service registers through `SMAppService`, and the actual Electron window loads its authenticated host origin. The desktop quits, the service unregisters, and the host exits.

From the repository root:

```sh
TRELLIS_DESKTOP_PREVIEW_APP="$PWD/apps/desktop/release/mac-arm64/Trellis.app" bun run --cwd apps/desktop test:int
```

The production app is not launched or installed. The [signature log](trellis-desktop-final-signature.log), [helper signature log](trellis-desktop-final-helper-signature.log), and [integration log](trellis-desktop-final-tests.log) record the results.

## Draft recovery in Aside

The browser check uses `http://127.0.0.1:53618` and `/tmp/trellis-evidence-ui-phase6/home`. It imports only fake drafts. The scratch host and its browser tab are closed after the check.

1. Import and restore `Original scratch draft`.
2. Import a different value for the same draft key. Restore that value and confirm both recovery copies remain.
3. Export drafts and parse the downloaded JSON as `trellis-drafts`, version `1`.
4. Import two flow drafts with the same flow ID from an old tab. Select the second draft through its title preview.
5. Confirm that the API saves `Second imported scratch node` as flow version `2`.
6. Open the older first draft. Confirm the version-conflict status and unchanged server version `2`.
7. Reload the page. Confirm that the older recovery copy remains available.

The screenshots are visually inspected:

- [Both text copies remain](draft-conflict-preserved.png)
- [Flow draft selection](flow-draft-picker.png)
- [Version conflict preserves the draft](flow-draft-version-conflict.png)

The flow ID is `01M2GTD59J6MGHF8JCSE5Y09PK`. The final API read returns version `2` and `Second imported scratch node`.

## Release gaps

This artifact is a local ad-hoc preview. Developer ID signing, notarization, Gatekeeper distribution, and approval changes through System Settings remain unverified. The machine has no Developer ID Application identity.

The current package targets macOS arm64. Cross-architecture native module builds remain unverified. Manual app replacement is the supported update path. A network update feed is not configured.
