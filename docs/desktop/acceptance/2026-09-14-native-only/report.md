# Native execution cleanup

Trellis starts agents through its local runtime. Each new project defaults to native execution.
The manager page contains Operation, General, and Harness settings.
General retains the repository directory picker and explicit repository trust.
The first-launch dialog offers new data, an existing directory, or Cancel.

Saved external assignments retain their identifiers and terminal captures as read-only history.
The native manager queue retains durable receipts, manual confirmation, retry, and process identity checks.
The desktop retains its background host, native window controls, and directory handoff.

## Verification

| Check | Result |
| --- | --- |
| Native execution services | 28 passed |
| Native API through the worker | 2 passed |
| Controller, native readiness, and directory handoff | 19 passed |
| Manager and desktop browser cases | 7 passed |
| First-launch unit cases | 4 passed |
| Desktop integration suite | 38 passed; two signed-app cases run separately |
| Workspace types | Nine passed |
| Biome | 2,158 files passed |

The full CLI suite has 207 passes and one obsolete command-list expectation.
The corrected command-list file has 16 passes.
Three existing Button and IconButton assertions fail when those unchanged primitives run alone.
The optional web size checks have four failures. The production build succeeds.

Aside screenshots show General and Harness in the native manager UI:
`/Users/navidkhan/.aside/u/0/sessions/2026-09-14_AyXeXTSGbMWPwg5q/artifacts/native-general.png` and `native-harness.png`.

The signed desktop preview passes two cases with 57 assertions: a new home and an existing directory.
The packaged smoke check passes all eight checks, including a host restart with a live terminal.
The full server suite records 1,004 passes, eight failures, and one error before obsolete fixtures are corrected.
The affected settings, activity, review delivery, and service contract cases pass after correction.
The obsolete copy-import test is deleted with its feature. The full server suite is not repeated after these corrections.

## Installed app and existing data

The signed app is installed at `apps/desktop/release/mac-arm64/Trellis.app` and opens the existing `~/.trellis` home.
Its release ID is `ed64b1a1d50dfd067c929f73e9005a2314bf98b905b069ae64b75ad14f7d6c0d`, with runtime protocol 5.
The live health, projects, and doctor endpoints return HTTP 200 at `http://127.0.0.1:4521`.
The host reports boot ID `01M2HGWSXEFMV0AC1F56Z456YS`.

The pre-change backup is `~/.trellis/backups/trellis-2026-09-15T03-07-41-575Z.tar.gz`.
The one-time cleanup archives full records in `~/.trellis/backups/native-only-cleanup-2026-09-15T03-13-17.188Z/records.json`.
It closes six verified stale TRL assignments and preserves their saved identifiers and output.
Wren's saved output endpoint returns 3,975 characters.
The archive retains the unknown delivery receipt as unknown.
The active queue contains zero unknown deliveries after cleanup.

Both projects retain their repository directories and use native configuration.
Operator's two active external assignment rows retain their process identifiers and running state.
The cleanup does not stop these external processes.
Both projects require explicit repository trust after cleanup.
At the final API check, TRL automatic dispatch is enabled and Operator automatic dispatch is paused.
The attempted TRL start reports the repository trust requirement.
The health endpoint reports a GitHub CLI error; GitHub access remains unverified.

Local check logs use the `/tmp/trellis-native-only-` prefix.
`/tmp/trellis-native-only-live-verification.json` records the final API check.
