# Desktop implementation and verification

Trellis runs ticket agents and flows through its local execution runtime.
The macOS desktop includes the renderer, database host, execution runtime, and CLI.
The first package target is Apple Silicon.

## Implemented paths

| Area | Behavior |
| --- | --- |
| Desktop | Native window controls, sandboxed renderer, folder picker, ticket links, and persistent host origin |
| Background service | `SMAppService` registration, login controls, host crash restart, and explicit stop and resume |
| Package | Bundled Bun, Node, CLI, renderer, PGlite assets, database worker, schema migrations, and native terminal modules |
| Runtime | Protocol 5, one owner lock, durable process identifiers, PTYs, streamed output, live process inspection, keyed input, deadlines, and confirmed stop |
| Controller | Durable event batches, fixed deadlines, runtime turn activity, assignment deduplication, attempt tokens, and durable receipts |
| Harness | Interactive CLI presets, permission bypass flags, automatic repository trust, Claude turn hooks, exact message receipts, and retained results |
| Evidence | Worktree diff and files, command results, artifact hashes, revision checks, and confirmed check exit recovery |
| Flows | Frozen graph and persona versions, agent attempts, YES/NO gates, human decisions, joins, deadlines, and cancellation |
| Work area | Activity first, assigned-agent terminal, local changes, checks, flow decisions, and diagnostics |
| Drafts | Browser export/import, independent recovery copies, collision preservation, and save acknowledgement |
| Data directory | New data or an existing home, confirmed service handoff, database backup, and paused automation |
| App replacement | Retained host resources and protocol checks before activation |

The Manager page has Operation, General, and Harness sections.
Operation separates automatic dispatch from the manager process. General holds the repository directory, persona, and concurrency limit.
Harness selects the agent executable and commands.

## Current verification

The [native execution report](acceptance/2026-09-14-native-only/report.md) records the current integration and package results.
The native controller, readiness, and directory handoff checks passed 19 tests.
The CLI installer, native agent commands, evidence commands, and instructions passed 28 focused tests.
The corrected CLI command snapshot passed all 16 tests in its file.
API, CLI, and server type checks passed. The layout and schema drift checks passed.

The schema journal ends with `0036_native_runtime_default`. That change sets the default for new agent rows to `native`.
Applied schema migrations and stored assignment history remain in the database.

## Real ticket result

The [supervised acceptance report](acceptance/2026-09-14-native-real/report.md) records one real Claude manager and worker job.
The manager became idle before ticket RAT-1 existed. A ticket event woke it automatically.
It started one worker with a stable request identifier.
The worker produced two files, passed its retained check, and registered both artifacts.
Independent checks covered twelve additional input/output cases.

A host restart preserved the runtime, manager, worker, attempts, and workspace.
A late receipt confirmed an unknown delivery without another send.
The manager consumed the result, posted `READY_FOR_LOCAL_REVIEW`, and returned to idle.
The operator approved 23 specific tool requests. This result does not establish unattended operation or a 24-hour soak.

## Historical evidence

The [Superset study](superset-research.md) records the source investigation that informed the desktop design.
The [desktop report](acceptance/2026-09-14-desktop/report.md) and [server log](acceptance/2026-09-14-desktop/trellis-server-final-tests.log) describe an earlier implementation snapshot.
The [input failure report](acceptance/2026-09-14-desktop/runtime-input.md) records the closed-pipe failure and its process-ownership fix.
The [directory report](acceptance/2026-09-14-directory/report.md) records the selected-home and native title bar checks.

## Use

Read [the desktop guide](../../apps/desktop/README.md) for build and package commands.
Close or quit detaches the window and leaves background work active.
Use Stop local work in the Trellis menu or Settings > Desktop to pause dispatch, stop owned processes, and remove the background service.
An unconfirmed process prevents a successful stop.

Use Settings > Desktop > Choose data directory to open an existing home in place.
The confirmation shows both directories, the backup path, and the service changes.
The handoff verifies the standalone service PID and configured home before it disables that service.
It backs up the database before schema changes and pauses automation. Both directories retain their files.

Export browser drafts under Settings, Drafts. Import that file in the desktop app.
Review each recovery copy before removal. Flow copies clear only after the host confirms the selected graph.

## Release checks

The local preview uses an ad-hoc signature. Developer ID distribution and notarization remain unverified.
Clean-machine installation, Intel packaging, logout/login, sleep/wake, and System Settings approval changes remain release checks.
VoiceOver, 200% zoom, and a full keyboard accessibility pass remain release checks.
The 24-hour unattended soak and a real PR with CI and Margin feedback remain unverified.

Git and the selected agent executable remain local prerequisites. Model access follows the agent's account requirements.
The app provides a manual replacement path through the update status in Settings > Desktop.
