# Desktop acceptance, 2026-09-14

The macOS arm64 package passes the desktop integration suite and eight package smoke checks. These checks use temporary data homes and temporary service labels. The production Trellis home and service remain unchanged.

## Package

- Artifact: `apps/desktop/release/mac-arm64/Trellis.app`
- Bundle icon: `icon.icns`, byte-for-byte match with `apps/desktop/build/icon.icns`.
- Icon SHA-256: `789f98732ff836decfc657f9849f916898d6d43ee58ee057da308265186150a0`
- Runtime protocol: `5`
- Host release SHA-256: `f327acd94758fde9b41d3792a59d5f959bf1edaefb57d4c646f021963abfc51d`
- Runtime dependencies: 61 packages, including Koffi `3.3.0` and `@koromix/koffi-darwin-arm64`.
- Executables: Bun `1.3.13`, Node `26.8.2`, Electron `44.3.0`.
- Build command: `bun run --cwd apps/desktop build`
- Package command, from `apps/desktop`: `CSC_IDENTITY_AUTO_DISCOVERY=false bunx electron-builder --config electron-builder.json --config.electronDownload.cache=/tmp/trellis-electron-cache --mac --dir`

The packaged host files match their recorded release hash. The smoke command copies those files outside the checkout before it starts any process. This prevents Node from resolving missing dependencies through the checkout.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Desktop units | 11 pass, 40 assertions | `bun run --cwd apps/desktop test` |
| Desktop types | Pass | `bun run --cwd apps/desktop typecheck` |
| Desktop integrations | 16 pass, 67 assertions | [Integration log](trellis-desktop-final-tests.log) |
| Packaged resource hash | Match, protocol 5 | [Hash result](trellis-desktop-final-hash.log) |
| Package smoke | 8 pass | [Smoke result](trellis-desktop-final-smoke.log) |

The integration suite covers cold host adoption, the sandboxed preload, first-launch import, Cancel, login shell environment, and stop sequencing. It also verifies launchd crash restart and registration through `SMAppService` with a temporary ad-hoc signed app. Both temporary services are removed.

The resource test removes the source app while a PTY remains active. A second child loads node-pty, fs-ext, and Koffi from the retained files. The same runtime and first PTY survive a host restart.

The package smoke verifies the database worker, host authentication, renderer assets, CLI, PTY, native process ownership call, PTY survival, and stable origin.

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

This artifact is unsigned. Developer ID signing, notarization, Gatekeeper distribution, and approval changes through System Settings remain unverified. The machine has no Developer ID Application identity.

The current package targets macOS arm64. Cross-architecture native module builds remain unverified. Manual app replacement is the supported update path. A network update feed is not configured.
