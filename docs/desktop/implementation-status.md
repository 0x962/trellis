# Desktop implementation and verification

The desktop has a local host, a separate execution runtime, and a durable manager queue.
Native ticket work and native flows use these services without a Superset host, tmux, Dots, or a Trellis cloud account.
The first target is macOS. The package tests use Apple Silicon.

The branch is `trellis-readiness-audit`. The starting revision is `3cd9e78d56365e0b349880ba659f0d55e06c7129`.
All acceptance jobs use scratch repositories and data homes. No existing project has migrated, and no production service has changed.

## Implemented paths

| Area | Code and behavior |
| --- | --- |
| Desktop | Electron window, sandboxed renderer, narrow folder picker, ticket deep links, native menus, and persistent host origin |
| Background service | Swift `SMAppService` helper, registration status, login controls, host crash restart, explicit stop and resume |
| Package | Bundled Bun, Node, CLI, renderer, PGlite assets, database worker, migrations, and native terminal modules |
| Runtime | Protocol 5, one lifetime lock, durable launch identifiers, PTYs, structured processes, bounded byte logs, keyed input, deadlines, and confirmed stop |
| Controller | Durable event batches, fixed due times, readiness checks, assignment deduplication, attempt tokens, and late receipt reconciliation |
| Harness | Claude 2.1.270 structured adapter, explicit repository trust, tool permission decisions, durable conversation state, and retained results |
| Evidence | Worktree diff and files, retained command results, artifact hashes, revision checks, and recovery of confirmed check exits |
| Flows | Frozen graph and persona versions, ordinary agent attempts, YES/NO gates, human decisions, joins, group deadlines, and cancellation |
| Work area | Attempt selection, structured output, terminal, local changes, checks, flow decisions, and diagnostics |
| Drafts | Explicit browser export/import, independent recovery copies, collision preservation, flow selection, and save acknowledgement |
| Migration | Offline home copy, incomplete-copy boot guard, preserved source, archived rollback, and versioned project configuration changes |
| App replacement | Complete resource versions remain outside the app bundle; incompatible protocols retain the previous host |

The [Superset study](superset-research.md) records the source investigation.
The [desktop acceptance report](acceptance/2026-09-14-desktop/report.md) includes package logs and inspected browser screenshots.
The [full server log](acceptance/2026-09-14-desktop/trellis-server-final-tests.log) records all 1,173 integration results.
Trellis uses its own runtime and controller implementation. It does not call Superset's host for native execution.

## Real ticket result

The [real acceptance report](acceptance/2026-09-14-native-real/report.md) records one supervised Claude job.
The manager became idle before ticket RAT-1 existed. A ticket event woke it automatically.
It started one worker with a stable request identifier.
The worker produced two files, passed its retained check, and registered both artifacts.
Independent checks covered twelve additional input/output cases.

A host-only restart preserved the runtime, manager, worker, attempts, and workspace.
A late receipt resolved an unknown delivery without another send.
The manager consumed the worker result, posted `READY_FOR_LOCAL_REVIEW`, and returned to idle.
All four dispatch records reached `sent`.

The operator approved 23 specific tool requests. This result does not establish unattended operation or a 24-hour soak.
The test created no pull request. Margin remains the local PR review surface.

## Verification evidence

| Check | Result |
| --- | --- |
| Runtime and layout suite | 45 passed, including closed stdin, concurrent keyed input, natural exit, separate PTY groups, timeout, and shutdown |
| Full server integration | 1,173 passed with 5,023 assertions; the worker transport phase passed in 327.5 seconds |
| Native public API | PTY, trust, permissions, stale actor rejection, evidence, retained output, and stop/resume passed |
| Worker regression suite | 15 passed across native attempts, structured execution, manager lifecycle, and migration API |
| Native service integration | 44 focused native execution, evidence, and flow tests passed with protocol 5 |
| Evidence recovery | 10 passed; an unknown check resolves only after the runtime confirms its exit |
| Empty database and migration journal | 6 migration tests and 2 schema drift tests passed |
| Project migration | 17 service, API, CLI, and layout tests passed |
| Flow execution | Deterministic runtime cases covered branches, human decisions, ordinary worker capacity, deadlines, and cancellation |
| Draft recovery | 34 focused unit/layout tests and 11 draft/flow-save browser tests passed |
| Ticket flow UI | 8 browser cases passed, including repeated start requests and frozen decision context |
| Focused visual components | 7 tests passed with 20 assertions |
| Window sizes | 900×650, 1280×800, and 1600×1000 checks passed |
| Native service | Temporary launchd and ad-hoc signed `SMAppService` registration, host crash restart, and removal passed |
| Resource replacement | Original app files removed; the same PTY survives; pinned Node starts another child and loads all three native modules |
| Packaged resources | All 8 smoke checks passed outside the checkout; protocol 5 resource hash matches |
| Desktop integration | All 17 tests passed, including actual signed Electron startup, import, Cancel, service restart, and source-app removal |
| Offline home import | 17 passed; a separate spawned-host test verifies the incomplete-copy boot guard |
| Type checks and lint | All 9 workspace type checks passed; Biome checked 2,220 files |

The broad unit run exposed three existing button tests. The starting revision reproduces all three failures.
The broad integration run also exposed an existing mobile token mismatch and four web bundle budget failures.
The clean starting revision reproduces those failures.
Initial JavaScript measured 236.4 KiB at the starting revision and 236.7 KiB with the desktop work area.
The existing limit is 220 KiB.

The first worker suite exceeded its 300-second wrapper limit. A separate run completed in 335.66 seconds and exposed six fixture failures.
The fixture fixes preserve worker restart after direct database setup and select the fake harness before worker creation.
All fifteen affected worker cases then passed. The complete worker suite also passed in 331.2 seconds. The wrapper now permits 600 seconds.

The import regression received empty child stderr after repeated file reads through Bun file streams.
The same broad run received empty output from unrelated child processes. Explicit bounded reads made the import regression pass.
The combined import, ticket event, GitHub, branch, backup, and evidence suite passed 54 tests after that fix.
The complete server run then passed all 1,173 tests.

A final boundary test found that a closed child input pipe could crash the runtime and leave the child alive.
The runtime now awaits the write callback, preserves failed keyed input as unknown, and retains the process handle for stop.
The full server run precedes that fix. After the fix, 45 runtime/layout tests and 44 native server tests passed.
An independent reviewer also passed 27 focused tests. Read the [input failure report](acceptance/2026-09-14-desktop/runtime-input.md) for the commands and results.

The actual Electron test found a different data directory from the background helper.
The app now creates and selects the shared Trellis directory before its single-instance lock.
The signed preview passed all 17 desktop integrations and 8 package checks after that fix.
The app test uses its packaged archive, a separate service identifier, and a scratch data home.

## Use and migration

Build and package commands live in [the desktop README](../../apps/desktop/README.md).
The development command accepts an explicit scratch home. Packaged service registration uses the desktop application data directory.
Close or quit detaches the UI and leaves background work active.
Use the native stop action to pause dispatch, stop known local processes, and remove the background service.
An unknown process blocks a successful stop.

Import requires a stopped source and an empty, separate target.
Review the preview before the import. The source version must still match when the copy starts.
Imported projects start paused and untrusted. Project migration requires a fresh inventory and no unresolved execution owner.
Rollback preserves new data in an archive. It does not erase the source or replace it with older files.

Export drafts from the old browser under Settings, Drafts. Import that file in the desktop app.
Review each recovery copy before removal. Flow copies clear only after the host confirms the selected graph.

## Release gates still open

Developer ID signing and notarization require a Developer ID Application identity.
The build machine has Apple Development identities but no Developer ID Application identity.
The local preview uses an ad-hoc signature without hardened runtime. This permits its native modules to load during local development.
The distribution configuration retains hardened runtime. Developer ID distribution and notarization remain unverified.

Clean-machine installation, Intel packaging, logout/login, sleep/wake, System Settings approval changes, and a signed app replacement remain unverified.
VoiceOver, 200% zoom, and a full keyboard accessibility pass remain release checks.
The 24-hour unattended soak and a real PR with CI and Margin feedback remain unverified.

The supported structured harness version is exact. Other versions fail with an actionable message.
Git and the selected agent executable remain local prerequisites. Model access still follows that agent's account requirements.
The app supplies a manual replacement path. It has no automatic update feed.
Native flow execution is available; the Margin review store has not changed.
