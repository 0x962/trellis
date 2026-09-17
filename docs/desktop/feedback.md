# Desktop feedback

Owner: lead agent. Production source: `main`.
Last update: 2026-09-16.

The user tests the installed UI. The production app lives at `~/Applications/Trellis.app`.
The production verification at 22:17 UTC uses source `49e4191e` and release `b78b2dc3`.
The production install workflow passes a live copy and restart check. The desktop guide records the command.

The Needs you error burst has one shared server error: `connect ENOENT ~/.trellis/runtime/runtime.sock`.
At 21:40:38 UTC, the page subscribes to 54 old terminal attempts after the runtime stops for the package update.
The page features are outside the requested scope and are removed. Ticket terminals still need access to retained output after a restart.
Evidence: `/tmp/trellis-needs-you-500-before.json` records the affected attempts and a reproduced 500 for TRL-65 / Esme.

The terminal fix starts the runtime after it validates the requested terminal. It reads retained output without a new agent process.
The socket client attaches its error handlers before it starts the connection. An isolated Bun HTTP test reproduces the earlier uncaught error.
All 34 focused regressions pass. Server and protocol typechecks pass.
The installed server returns 200 for all 54 previously failed terminal streams. Each stream reports an exited process.
A fresh terminal passes input, output, resize, and Stop checks on release `c2826d27`. The final runtime list contains zero active sessions.
The installed route asset contains only the Needs you heading and an empty body. The browser regression is not run; the user tests the UI.
Evidence: `/tmp/trellis-terminal-recovery-acceptance.json`, `/tmp/trellis-installed-runtime-check.json`, and `/tmp/trellis-needs-you-production-install.log`.

## Production source

At 13:31 UTC on September 16, release source `7b805959` rejects a Codex manager during session restoration.
That source omits the Codex manager support from `trellis-readiness-audit`. The failed restore returns a generic HTTP 500.
Later source `13a69d47` includes Codex manager support but still omits the project navigation change in `b64e9919`.

Production builds require a clean `main` checkout at the current, freshly fetched `origin/main` commit.
The requirement applies to installed packages and `--prepare` candidates.
The installer verifies that the candidate includes the installed source before the build and before publication.
A macOS advisory lock permits one publication at a time. Publication also verifies that `origin/main` still contains the candidate.
All 21 installer checks pass with 53 assertions. A direct branch install command rejects `trellis-readiness-audit` before the build starts.

A failed native launch during restoration returns `RESTART_FAILED` with its cause and request ID.
Both API transports log failed procedures with the same request ID. Unexpected errors retain their private details in the server log.
The combined source passes 78 server integration tests, five API contract tests, and all nine workspace typechecks.
All three project navigation tests pass after integration with the installed source.

At 13:45 UTC on September 16, the production installer publishes source `c6e7542c` from clean, published `main`.
The installed release is `d9df9d36`. Signature verification and all 13 packaged smoke checks pass.
The HTTP host, runtime, and five active agent processes retain their IDs during the copy. Their provider session IDs also remain unchanged.
The host returns HTTP 200. A separate check process exits with code zero during the build.
Restart Trellis to activate this package. Evidence: `/tmp/trellis-main-production-install.log` and `/tmp/trellis-main-install-evidence.json`.

## Trellis SRE persona

The live Trellis SRE persona is `01M2N80YVHB63B85798BJPT4G4`, with kind `builder`.
Its instructions live in the Trellis SRE persona.
The TRL manager persona and Deploy Queue description route eligible tickets to one SRE batch owner.
The SRE merges and tests the combined batch, builds from published main, installs once, and coordinates one restart with the manager.
It retains a durable release record and a checkpoint comment that the manager can read.
After resume, it verifies the active release, health, and saved provider conversations before a deployment result.
Required human acceptance stays separate from release completion.

The persona, manager instructions, and status description pass exact API readback on September 16 at 13:55 UTC.
The running manager receives the coordination policy without a context reset.
Six documentation checks and both API input schemas pass. Two Astra agents review the workflow and role boundaries.
The quit-and-reopen command passes shell syntax and disabled AppleScript checks. This configuration task does not execute a deployment or restart.
Evidence: `/tmp/trellis-sre-config-proof.json` and `/tmp/trellis-sre-docs-check.log`.

## Automatic repository access

The Workbench manager could not launch WO-1 because its child project had an empty directory and `trustedDirectory: false`.
The Workbench parent already specified `/Users/navidkhan/projects/workbench`.
The lead applies Navid's automatic-trust authorization to live project settings and supplies the existing parent directory to that child.
At 14:14 UTC on September 16, worker `01M2N91KAYSS4YAVG0SQN2YX2W` runs with a confirmed provider session and no error.
The shared manager persona includes the automatic repository access policy.

Project settings have no repository approval field. A database migration removes the saved repository approval flag and the unused tool permission flag.
An agent can update its project directory without a separate human approval. Native harnesses apply permission bypass at launch.
Agent and flow launches use the nearest configured ancestor directory when a subproject has no directory.
An explicit child directory takes precedence. Other launch settings remain specific to the child project.
Settings show the inheritance rule beside the directory field for subprojects.
Native harness startup applies the repository trust and permission flags before execution.

Nine focused browser tests pass. All 26 native trust and permission tests pass with 109 assertions.
The affected backend passes 102 integration tests with 515 assertions. Five API schema tests and all nine workspace typechecks also pass.
The separate flow-terminal browser fixture still expects SSE, although the terminal uses a WebSocket.
Five other flow browser cases pass. The user checks the installed appearance.
The existing Trellis SRE owns the coordinated production release after the source reaches tested main.
Evidence: `/tmp/trellis-trust-live-proof.json`, `/tmp/trellis-trust-child-after.json`, and `/tmp/trellis-auto-trust-harness-checks.log`.
The backend verification record is `/tmp/trellis-auto-trust-backend-validation.txt`.
The combined source retains the manager-wait migration as `0044` and applies the approval removal as `0045`.
All nine browser cases pass again on the combined source. The CLI now classifies `RESTART_FAILED` as a runtime failure with exit code 6.
All eight CLI error tests pass with 83 assertions. All nine workspace typechecks pass after the merge corrections.
Logs: `/tmp/trellis-auto-trust-merged-ui.log`, `/tmp/trellis-auto-trust-merged-typecheck.log`, and `/tmp/trellis-auto-trust-cli-errors-green.log`.
The final migration and launch checks pass 52 cases with 175 assertions after both obsolete flags are removed.
Those checks include all four saved flag combinations and an agent directory update after migration.
Five final API tests pass. The independent review reports no remaining findings.
Evidence: `/tmp/trellis-auto-trust-and-permissions-final.log` and `/tmp/trellis-auto-trust-api-final.log`.

## Project navigation

The project name opens its manager terminal. Each project row uses the Trellis mark.
Tickets and Settings remain below the project name. The project row shows the selected state on its manager page.
Root, nested, and archived projects use this navigation.
All three navigation browser tests first fail on the old project destination and pass after the change.
Web typecheck and scoped Biome checks pass. The user tests the installed appearance.
Production source `be3f016a` passes all 13 packaged smoke checks and signature verification.
At 00:40:18 UTC on September 16, the verified ditto copy updates `~/Applications/Trellis.app` to release `94f2db73`.
The desktop, HTTP host, runtime, and all five active agent processes keep their identities. The host returns HTTP 200.
Restart Trellis to activate the sidebar update. Evidence: `/tmp/trellis-project-navigation-install.json`.

## Automatic background service

Trellis enables its background service at startup. It asks for approval only when macOS requires approval in Login Items.
The startup regression tests cover initial registration, repeated launches, an enabled service, and required macOS approval.
The focused desktop tests pass: 24 tests and 55 assertions. Desktop typecheck and scoped Biome checks pass.

At 23:28:02 UTC, macOS reports a missing plist for the bare `apps/desktop/dist/TrellisHost` executable.
That executable sits outside an app bundle. Both packaged helpers contain their LaunchAgent plist and report `enabled`.
The caller of the bare helper remains unconfirmed. Evidence: `/tmp/trellis-plist-processes.json`.
At the same time, two coding sessions install separate builds. A direct copy into the installed path fails with `Operation not permitted`.
The production workflow copies into a temporary directory, verifies the copy, and publishes the complete bundle through an atomic exchange.

The installed build `21572c5e` includes automatic service startup and the manager context button.
Its signature and plist checks pass. The host reports HTTP 200, and the active release matches the installed release.
An isolated copy passes the signed-app startup test with 21 assertions. It registers its temporary service and opens the renderer without the extra prompt.
The first run stops at an outdated title-bar position assertion. The corrected assertion matches `windowOptions.ts`, and the complete rerun passes.
The test removes its temporary service and data. The installed commit stays unchanged during both runs.
Evidence: `/tmp/trellis-background-installed.json` and `/tmp/trellis-background-live-health.json`.

## Startup output limit

At 23:42 UTC, the restart capture prints 1,270,865 bytes through a child process with a 1,048,576-byte output limit.
It includes launch arguments and agent messages from 273 retained sessions, although only five sessions remain active.
The error occurs after the desktop stops the HTTP host and before it saves the restart plan. The agent runtime remains active.
Evidence: `/tmp/trellis-startup-maxbuffer-before.json` records the exact error and byte counts.

The restart capture transfers only active session identifiers, process ownership, provider identifiers, and model names through the child output.
It still rejects unknown processes and sessions without a confirmed provider identifier.
The focused capture and activation suites pass: 31 tests and 61 assertions. Desktop typecheck and scoped Biome checks pass.
A read-only check against the live runtime saves all five sessions to a scratch plan of 2,561 bytes.
Provider identifiers and process identities remain unchanged. Evidence: `/tmp/trellis-startup-maxbuffer-after.json`.

## Startup readiness

At 23:45:17 UTC, the manager accepts its restart prompt while its transcript lists `trellis` under `pendingMcpServers`.
At 23:45:26 UTC, it says that the tools still connect. The HTTP server already accepts requests.
The startup completion signal confirms a received prompt but does not confirm tool discovery.

Each Claude manager loads the Trellis tool catalog before it accepts a prompt.
The bridge publishes a discovery receipt for the exact attempt. The prompt hook requires that receipt and a successful runtime acknowledgment.
A failed connection or acknowledgment blocks the prompt and reports the cause. One eight-second deadline covers both operations.
The desktop publishes its connected host after agent restoration, CLI setup, and update checks complete.
Early activate, second-instance, and deep-link events keep the startup window open until that sequence finishes.
App startup owns this sequence. Each restored session confirms its tool connection before startup completes.
The same session check also applies to a manager that a person starts or restarts after the app opens.

The desktop readiness and output-capture tests pass: 19 tests and 54 assertions.
All 20 release activation tests pass. The native startup progress test passes with six assertions after the desktop assets build.
The restart and manager service checks pass: 34 tests and 190 assertions.
The authenticated Claude test confirms delayed discovery and prompt acknowledgment. The account then returns its session usage limit.
The real missing-discovery test passes. The provider limit prevents the real tool-call and exact-resume assertions from completion.
Evidence: `/tmp/trellis-manager-ready-live-green.log`, `/tmp/trellis-startup-combined-desktop.log`, and `/tmp/trellis-startup-combined-server-green.log`.

The merged startup progress screen passes eight desktop checks with 58 assertions.
These checks require the main window to appear only after readiness and the progress screen's completion step.
A startup failure shows the error without a main window.

A provider turn failure after confirmed resume remains visible on the agent. It does not block the desktop from opening.
Process ownership errors and absent prompt receipts still block restoration. The regression first fails with `rate_limit` at the restart gate.
All 26 restart service tests pass after the fix. Evidence: `/tmp/trellis-provider-startup-red.log` and `/tmp/trellis-provider-startup-green.log`.
The final combined restart, tool, and prompt-hook checks pass: 41 tests and 187 assertions.
Evidence: `/tmp/trellis-final-startup-services.log`.

## Codex managers

Codex 0.154.0 supports managers through its native engine and interactive terminal.
The engine receives the saved role instructions and authenticated Trellis tools. Each turn has an empty native environment list.
The terminal connection preserves that policy on typed turns and resume. It rejects requests for another conversation.
Managers require Codex 0.154.0 or later. Workers retain their existing native tool access.

The combined native engine and service checks pass: 44 tests and 486 assertions.
Local provider fixtures exercise Sol and Astra through initial, sent, and typed turns, exact-session resume, tool calls, and normal terminal exit.
A forced shell-tool call returns an error and creates no file.
An authenticated Sol session calls the local Trellis fixture, stops, resumes its exact provider conversation, and recalls a random prior marker.
That separate test passes with eight assertions. Both native terminal attachments render the response.
Evidence: `/tmp/trellis-codex-final-combined.log` and `/tmp/trl-hhost-EQecZV`.

All nine workspace typechecks pass. Scoped Biome checks pass.
The [host guide](host-testing.md#codex-manager-checks) records the native and authenticated commands.

The production package uses source `4df843c6` and release `e447b219`.
All 13 packaged smoke checks pass. The signed app starts an isolated macOS service and opens its renderer with 23 passing assertions.
At 00:28:50 UTC on September 16, an atomic ditto install updates `~/Applications/Trellis.app`.
The desktop, HTTP host, runtime, and all four active agent processes keep their identities during the copy. The host returns HTTP 200.
The user can restart Trellis to activate the package. This verification does not restart the live app or reset its manager conversation.
Evidence: `/tmp/trellis-codex-manager-production.log`, `/tmp/trellis-codex-manager-signed-startup.log`, and `/tmp/trellis-startup-repair-install.json`.

## Default models

New sessions with no model selection use explicit models:

| Harness | Default model |
| --- | --- |
| Claude | `claude-opus-5` |
| Codex | `gpt-5.6-sol` |
| OpenCode | `vercel/anthropic/claude-opus-5` |
| Pi | `vercel-ai-gateway/openai/gpt-5.6-sol` |

Explicit selections and resumed sessions retain their models. The settings hint shows the default for the selected harness.
Four process-fixture checks pass with 20 assertions. Seven API tests pass with 16 assertions.
API, server, and web typechecks pass. Browser assertions for the settings hints are added; the user tests the installed UI.

## Automatic session resume

A package update saves the active provider sessions before runtime shutdown. Workers resume before managers, in the same directories and conversations.
The first resumed prompt states that the system restarted and tells the agent to continue unfinished work. Managers also receive the current role instructions.
Manually stopped assignments stay stopped. Completed flow results keep their original output and decisions.
A saved restart plan and fixed attempt IDs prevent duplicate launches after an interrupted update. A failed resume retains its plan.
An unchanged package keeps the active processes and sends no restart message.

The restart checks pass: 58 integration tests, eight protocol, contract, and layout tests, and 36 desktop tests.
Four integration cases stop a real runtime and resume Claude, Codex, OpenCode, and Pi fixture executables on a new runtime.
These cases retain the provider ID, working directory, model, assignment, and one restart receipt. They do not call authenticated model providers.
All nine workspace typechecks and repository lint pass. The installed package passes all 13 smoke checks and signature verification.
Both native macOS service tests pass with temporary homes and service labels. The real-home guard passes.
At 22:17:05 UTC, an atomic ditto reinstall preserves the desktop, HTTP host, runtime, and active agent process identities. Health returns 200.
Evidence: `/tmp/trellis-restart-integration.log`, `/tmp/trellis-restart-unit.log`, `/tmp/trellis-restart-installed-smoke.log`, and `/tmp/trellis-restart-install-evidence.json`.

## Manager conversation reset

At 22:25:52 UTC, a coding agent explicitly stops Hana before the package restart.
At 22:27:23 UTC, desktop activation completes the resume of seven active workers.
At 22:27:29 UTC, the coding agent starts Hana with `--new-session` for a prompt update.
The provider session changes from `122bc235-9f0d-4c75-a5a7-c34567a2144f` to `2b500365-7259-4a97-bd3d-c107743aa729`.
The old transcript remains on disk. The new transcript begins a separate conversation.
The same caller requests another fresh conversation at 22:31:28 UTC.

Evidence: `~/.trellis/desktop-host.log`, lines 18549, 18557, and 18563, records Stop, desktop resume, and ordinary Start.
The descriptor for attempt `ba1947a0-16cd-4982-84cf-136eba2e286a` contains `--session-id` with the new provider ID.
The caller transcript records the explicit `trellis agents start ... --new-session` command.

Agent callers cannot reset an existing manager conversation. Default starts resume its saved conversation with the current persona instructions.
A person can explicitly request a fresh conversation. A failed launch before process creation retains the previous attempt for resume.
The repository install instructions require conversation preservation during prompt updates and deployment.

An isolated authenticated Claude 2.1.273 test recalls a random marker after stop and resume with a changed system prompt.
The resumed prompt contains no marker. Both turns use provider session `149b12b5-245e-45fb-94ba-43757d9515c3`.
The test uses `--system-prompt-snapshot off`. An additional instruction to change the reply prefix fails; memory recall passes.
Evidence: `/tmp/trl-real-claude-memory-jbKfJE/memory-verification.json`. Both test processes and the isolated runtime exit after the check.

All 51 focused integration tests pass, with 240 assertions. All nine workspace typechecks and scoped Biome checks pass.
Evidence: `/tmp/trellis-continuity-integration.log` and `/tmp/trellis-continuity-typecheck.log`.
The production package at `71838d83` passes 13 smoke checks and signature verification.
At 22:37:21 UTC, ditto installation preserves the desktop, host, runtime, and all eight active agent process identities. Health returns 200.
The package is installed in `~/Applications/Trellis.app`. The next restart activates its changes.
Evidence: `/tmp/trellis-continuity-production.log`, `/tmp/trellis-continuity-install-evidence.json`, and `/tmp/trellis-manager-reset-evidence.json`.

## Current verification

| Follow-up feedback | Status | Verification |
| --- | --- | --- |
| Add a manager button to start fresh context after prompt changes. | Installed; user UI check pending | Restart with new context confirms a manager Stop before a fresh Start. Four unit tests and nine integration tests pass. The new conversation uses the saved persona and project instructions. Resume preserves the current conversation. |
| The window appears hung. The manager cannot accept input or resize. | Installed | Failed cleanup retains the live PTY handle. Regression tests cover input, resize, repeated Stop, and a later natural exit. |
| Fix the manager terminal width. | Installed; user UI check pending | The installed runtime accepts input and returns `80 200` after a resize to 200 columns and 80 rows. |
| Remove the rounded inner page cards. | Installed; user UI check pending | Shared page frames have no rounded border or outer inset. Ticket properties use a straight divider. |
| Make project submenu items more compact. | Installed; user UI check pending | Desktop rows use 28 px; touch rows use 44 px. |
| Align and redesign the Archived submenu. | Installed; user UI check pending | The caret, label, and count use the same slots as project rows. Expanded projects use nested indentation. |
| Remove the manager settings icon. | Installed; user UI check pending | The manager toolbar holds its process control. Control+] returns focus to that control. |
| Stop and restart report a schema error. | Installed | Failed cleanup reports RUNNER_UNAVAILABLE. Three API regression tests pass. The nine live Stop requests each return 200. |
| Fix the broken Agent tab terminal. | Installed; user UI check pending | A padding-free host gives FitAddon the available size. Runtime failures remain visible. |
| Use Astra subagents. | Applied | Astra agents cover the UI, lifecycle, native process inspection, production install, and restart workflow. |
| Address root causes. | Installed | Native process inspection replaces the spawned ps command. HTTP startup stays independent of shell setup. launchd reports `spawn type = interactive (4)`. |
| Keep Needs you empty until a later design. | Installed; user UI check pending | The page contains its heading and an empty body. The route and menu entry remain. No page features or subscriptions remain. |
| Build production and use ditto to install in ~/Applications without closing Trellis. | Verified | The copy preserves the desktop, HTTP host, and runtime PIDs. See the [production install guide](../../apps/desktop/README.md#production-install). |
| Stop active agents and load all changes when a new package starts. | Implemented and tested | Activation saves active sessions, stops the old host and runtime, and resumes those sessions on the new release. An unchanged package preserves active sessions. |
| Resume agents after a system restart and tell them to continue. | Installed and tested | A durable restart plan preserves the conversation, workspace, harness, and model. The first resumed prompt gives the restart notice. Manually stopped agents stay stopped. |

The production build at `14132bac` passes all 13 packaged smoke checks and signature verification.
The atomic copy preserves the real Electron and HTTP host process identities.
The app restart stops the previous HTTP host, runtime, and test PTY. The final app launch activates release `c2826d27`.
Evidence: `/tmp/trellis-final-copy-evidence.json` and `/tmp/trellis-final-activation-check.json`.
The runtime passes 52 unit tests and 65 integration tests. The shell changes pass 61 focused tests.
Independent Astra reviews cover failed cleanup, natural exit, shell setup, and HTTP startup.

The first activation reaches the legacy runtime shutdown error. That runtime contains the process cleanup bug.
The user authorizes the stop. Native process checks confirm all nine agent processes and the old runtime have exited.
The new HTTP host starts on port 4521. Authentication rejects an absent token and accepts the desktop token.
All nine API Stop requests return 200. The new runtime reports release `309bd1ac`.
A live PTY check verifies start, input, streamed output, 200-by-80 resize, process inspection, and confirmed Stop.
The runtime list after the PTY check contains zero active sessions. Hana stays stopped.
Evidence: `/tmp/trellis-production-copy-evidence.json`, `/tmp/trellis-approved-stop-evidence.json`, `/tmp/trellis-production-stop-api.json`, and `/tmp/trellis-installed-runtime-check.json`.

The previous launchd plist selected `ProcessType=Background`. Its runtime had scheduler priority 4 under system load above 100.
The runtime gained about 0.07 CPU seconds over 100 wall seconds. Native checks finished in milliseconds in a separate process.
The installed host now uses Interactive. Its runtime has scheduler priority 31, and the live terminal check finishes in 160 ms.
[Apple's launchd manual](https://github.com/apple-oss-distributions/launchd/blob/main/man/launchd.plist.5) defines Interactive for services that an app needs to remain responsive.

| New feedback | Status | Owner | Verification |
| --- | --- | --- | --- |
| Open Trellis at the maximum window size without native fullscreen. | Installed; user UI check pending | Desktop agent | 6a1b1deb. Five tests and the desktop typecheck pass. Every open restores a minimized window, exits fullscreen, and maximizes the window. |
| Improve the sidebar using the Superset screenshot. | Installed; user UI check pending | Lead | Sidebar changes cover icons, row spacing, selected rows, and separation between root projects. |
| Remove the space above the app content. Extend the content to the top. | Installed; user UI check pending | Lead | The topbar and sidebar reserve space for native controls within their own rows. |
| Move all manager configuration into project settings. | Installed; user UI check pending | Settings agent | All four settings browser cases pass. They cover saved values, one shared unsaved draft, default models, and trust recovery. |
| Keep the manager page focused on its interactive CLI and process controls. | Installed; user UI check pending | Lead | The terminal size, process controls, empty state, and error cases pass. The user will check the installed terminal. |

The latest UI run reports 18 of 20 cases passed: `/tmp/trellis-full-manager-browser-final.log`. All four settings and four desktop workspace cases pass.
The failed assertions concern transient titlebar geometry and the lazy settings route. Test-only corrections are not rerun.
Five window tests, eight terminal UI tests, and the typechecks pass. The user requests deployment and will test the installed UI.

| Feedback | Status | Owner | Verification |
| --- | --- | --- | --- |
| Show agent names instead of identifiers in activity and comments, including old entries. | Installed | Lead and API agent | 26 API integration tests pass. The browser shows names in activity, comments, and thread labels. |
| Center the ticket content within the main panel. Keep the text left aligned. | Installed | Layout agent | Browser geometry passes at wide desktop and mobile widths. |
| Make Activity the first and default ticket tab. | Installed | Layout agent | Browser test passes. |
| Rename Overview to Agent. Show only agent content in Agent. | Installed | Layout agent | Browser test passes; shared ticket details remain above the tabs. |
| Remove red bars from ticket cards. | Installed | Card agent | Bars indicated failing CI. Two board browser tests pass after removal. |
| Use the actual process as the authority for agent status and metadata. Remove database state used to track process status. | Installed | Runtime agent and lead | Migration 37 removes the state column and harness snapshots. API and page status uses live process inspection. |
| Remove the agent-attempt dropdown. Show the CLI of the agent assigned to the ticket. | Installed | UI agent | The assigned-agent browser test passes. |
| Remove green dots next to agent avatars. | Installed | UI agent | Shared avatar components and consumers updated. Component and browser checks pass. |
| Update builder prompts. Remove name prefixes, routine logs, and evidence bookkeeping from comments. | Saved and verified | Lead | Removed the instruction that requests name prefixes. The live builder persona limits comments and requires checks before review; its latest update is 17:25 UTC. |
| Every harness start command includes its permission-bypass flag or equivalent. | Installed and saved | Lead | Claude, Codex, OpenCode, and Pi have native permission configuration. Both saved projects use bypass flags for start and resume. |
| Track all feedback in a Markdown file. Use subagents to fix and merge the work. | Merged and installed | Lead | Main and the integration branch contain the fixes and this checklist. |

## Completed foundation and earlier feedback

| Feedback | Status | Evidence or limit |
| --- | --- | --- |
| Investigate manager readiness, missing triggers, duplicate agents, and activity without results. | Installed host and manager checks pass | Native process ownership, durable dispatch receipts, stable assignment IDs, and one active manager per project. |
| Learn from Superset and build a desktop host. Target macOS first, other platforms later. | Installed | Electron app and macOS background host. |
| Remove the Superset dependency and obsolete migration code. Manual one-time data handling is sufficient. | Installed | Native execution and selected local data home. |
| Let the desktop app use the existing data directory and provide native window controls. | Installed | Directory selection and macOS title bar. |
| Allow all tool permissions for the manager. | Installed | Built-in CLI commands enable all tool permissions. Both saved project commands match this setting. |
| Fix crashes and stuck runs caused by evidence file descriptor leaks. | Installed | Positional reads replace the leaking stream. Live repeated workspace scans retain zero workspace file descriptors. |
| Give the manager periodic heartbeats. Read and follow the manager prompt. | Installed | The installed manager test receives two automatic heartbeats with the same process and provider session. |
| Keep manager comments useful. Send builder details directly, follow ticket scope, and avoid repeated blockers or questions. | Saved and verified after reinstall | The live manager persona contains the rules and reports an update at 17:16 UTC. |
| Do not repeat agent names and roles inside comments. | Manager and builder updated | The UI supplies the author name. |
| Rebuild, reinstall, and open the app after the changes. | Installed and open | The final UI refresh preserves Hana and four worker processes. |

## Completion checks

- Keep the same ticket data, worktrees, and conversation history.
- Test live terminal input, output replay, resize, disconnection, and process exit.
- Confirm heartbeat delivery with the interactive CLI.
- Confirm that process status comes from live process inspection.
- Review and merge the complete diff.
- Rebuild, sign, reinstall, open, and verify the installed app.


## Verification evidence

The earlier UI and reliability changes have focused API, browser, runtime, CLI, and schema checks.
Evidence includes `/tmp/trellis-real-cli-smoke.log`, `/tmp/trellis-actor-names-green.log`, and the current source checks below.
The earlier host candidate `64d9dc12` passes all 13 packaged smoke checks. Its installation is verified. Evidence: `/tmp/trellis-final-reliability-smoke.log` and `/tmp/trellis-final-reliability-install.log`.

## Reliability acceptance

| Finding or request | Status | Evidence |
| --- | --- | --- |
| Ticket summaries and actor filters still show IDs. | Installed | Commit d54e58d4; 18 API tests and the filtered board browser test pass. |
| GitHub PR batch timeouts incorrectly report authentication failure. | Installed | Commit dceff745; 131 GitHub integration tests pass. |
| TRL-70: send returns success before the initial CLI prompt exists. | Installed | Commits f510bfac and 595b0016; initial and follow-up receipts are required. Busy sends write no text. |
| A failed first controller tick prevents future ticks. | Installed | Commit 595b0016; the normal periodic tick continues after its logged error. |
| TRL-69: some agent commands return 401. | Installed builder and reviewer verified | The live agents read the brief, health, and local review list. Builder HTTP evidence: `/tmp/trellis-host-live-builder-http.log`. |
| Act as manager and drive a ticket through the installed CLI. | Complete; TRL-71 is Done | Esme opens PR 30, addresses Wren's two findings, and Wren approves the fixes. The user merges the PR; the lead installs it and completes the ticket. |
| Preserve the user's manager choice. | Restored at 20:02:37 UTC | Hana retains provider session f8584a45-27db-465c-8008-a4eaa12dc273. TRL dispatch is enabled; OP dispatch stays paused. |
| No hacks, shortcuts, or fallbacks. | Acceptance constraint | Each reproduced defect requires a regression test and a fix to its owning component. |

The final installed manager test receives two automatic heartbeats in process 82463 with provider session `80527f5b-a082-413b-ae2c-fa84eec6e118`.
Both turns finish idle at 19:58:59 and 20:00:08 UTC. Evidence: `/tmp/trellis-installed-heartbeat-t8cE7s/evidence.json`.

## Required harness tests

Run the host gate before the manager acceptance ticket. Cover Claude, Codex, OpenCode, and Pi separately.

| Required behavior | Acceptance evidence |
| --- | --- |
| Start an agent | A real child process and initial provider readiness. |
| Start every supported harness | Separate cases for all four built-in harnesses. |
| Report a missing harness | A named executable and actionable error before a false successful start. |
| Always bypass permissions | Actual start and resume arguments or native permission configuration. |
| Get the session ID | The provider conversation ID, distinct from the Trellis attempt ID. |
| Resume by ID | The requested conversation resumes with its prior context. |
| Stop by ID | The matching process and its owned children exit. |
| Select the model | The provider confirms the requested model. |
| Send messages | The target session receives the requested message. |
| Read responses and output | Complete output reaches a subscriber and survives reconnect. |
| Read status and tool activity | Provider lifecycle events and actual process inspection supply the display. |
| List running sessions | Results contain only live matching processes. |
| List idle sessions | Results contain only live sessions whose provider reports idle. |
| List crashed or errored sessions | Exit codes and errors remain inspectable. |
| Read elapsed run time | Time advances while the process runs and stops after confirmed exit. |
| Interrupt a session | The current turn stops, the conversation remains, and the next message works. |

The process gate passes independently of a manager: 100 process/reconnect cycles retain 16 file descriptors. Two readers and replay match 2,097,409 binary bytes. The packaged host test confirms one PID for 12 concurrent starts, rejects a conflicting start, and preserves the PTY through an HTTP host restart. All four harness lifecycles pass independent tests. Codex native failure checks and the updated OpenCode repeat also pass. The installed heartbeat check passes twice with the same process and provider session.

## Independent host results

- Earlier independent runs pass on Claude 2.1.272, Codex 0.154.0, Pi 0.73.1, and OpenCode 1.18.31.
- The latest installed OpenCode repeat passes 27 assertions in 22.37 seconds: `/tmp/trellis-host-wire-real-opencode.log`.
- The current Codex lifecycle includes a real hosted WebSearch and passes 29 assertions: `/tmp/trellis-codex-appserver-final-real.log`.
- Native tests cover file edits, shell output, provider IDs, explicit models, prompt receipts, tool events, interruption, follow-up, stop, and exact-ID resume.
- Host tests also verify pushed output, retained events, process lists, and elapsed time.
- Twelve concurrent starts produce one process. Twelve concurrent native resume requests produce one prompt.
- An uncertain native send remains inspectable and is not sent again after a host restart.
- The host requires OpenCode 1.18.31. The installed executable now resolves to that version.
- The packaged host smoke test passes authentication, CLI, PTY, process ownership, reconnect, stop, and host restart checks.
- Independent host tests use separate runtime processes and do not change the user's manager.

Commands and coverage: [Host tests](host-testing.md). Detailed evidence: [Harness acceptance](harness-acceptance.md).

Current source checks include 212 CLI integration tests with 1,191 assertions and 39 desktop tests with 98 assertions. Two desktop preview cases skip.
The production host cases and interrupt boundary regression pass: 12 tests with 86 assertions.
The model settings browser cases pass, including a blank model that uses the harness default without disabling Start.
The source supports Claude, Codex, OpenCode, and Pi. Every built-in launch requires a native prompt receipt.

Codex final HTTP 400, 401, 429, and 503 failures, dropped streams, and interruption during retries pass native engine tests.
The complete suite also tests hooks, engine crashes, event transport loss, terminal exit, and terminal launch failure: 11 tests with 43 assertions.
Evidence: `/tmp/trellis-tool-errors-native-faults-final.log`. The [acceptance record](harness-acceptance.md#codex-acceptance) tracks remaining checks.

## Current integration audit

| Request or finding | Status | Evidence or next check |
| --- | --- | --- |
| Connect the independent host to the app and manager. | Installed | Production host tests cover start, send, interrupt, stop, exact resume, and the single-manager constraint. |
| Complete Codex through one local app-server and its native terminal. | Installed | Shared-engine lifecycle passes 29 assertions. Native failure tests pass 43 assertions. |
| Remove the unsupported harness entirely. | Installed | The supported list contains Claude, Codex, OpenCode, and Pi. |
| Use the updated OpenCode executable. | Installed executable and complete host sequence verified | Version 1.18.31 passes 27 assertions, including file edit, shell tools, interruption, and resume. |
| Show native flow tasks through their own terminal. | Installed | Six flow browser tests pass, including exact attempt selection and refusal to attach a replaced attempt. |
| Verify the saved manager and builder prompt rules. | Live read verified | Both prompts prohibit name prefixes, routine logs, repeated blockers, and questions about adjacent scope. |
| Preserve the user's current manager choice. | Restored | Hana runs as PID 13113 after the host update. Evidence: `/tmp/trellis-final-reliability-restored.json`. |

The source audit confirms the centered ticket body, Activity default, Agent tab, assigned-agent terminal, avatar changes, and board card changes.
The manager page excludes the queue. The data selector and native macOS title bar remain present.
The actor resolver covers comments, activity, ticket summaries, actor filters, attachments, and PR links.

Live read commands: `trellis personas list --json`, `trellis projects show TRL --json`, `trellis projects show OP --json`, and `trellis agents list --project TRL --json`.
The authenticated wrapper reads the desktop token without printing it. These checks do not start or modify agents.

Output surface checks: six flow browser tests, one external review browser test, and two FlowProgress unit tests pass.
The UI typecheck and focused Biome checks pass. Evidence: `/tmp/trellis-output-surfaces-green.log`, `/tmp/trellis-review-results-green.log`, `/tmp/trellis-output-surfaces-final.log`, and `/tmp/trellis-flow-terminal-final.log`.
The final three-case run verifies terminal identity, focus, and explicit review refresh after the external-link role fix.

## Live ticket acceptance and final fixes

TRL-71 completes the installed workflow with [PR 30](https://github.com/0x962/trellis/pull/30). Wren approves the final changes at commit `349dd33b`.
Esme writes the guide, links the PR, registers evidence, and receives follow-up instructions through the installed CLI.
Wren reviews the guide, posts two findings, and approves the fixes after a second review. Both findings are resolved.
The CLI stops both agents and retains their worktrees, provider IDs, and all 520,531 bytes of builder output.
Evidence: `/tmp/trellis-host-live-rereview-result.json` and `/tmp/trellis-host-live-stop-evidence.json`.

| Defect or condition | Status | Evidence |
| --- | --- | --- |
| A fresh approved repository still prompts for native Claude trust. | Installed | a6740542 and a077219a. Fresh-repository lifecycle passes 28 assertions; profile preservation and relative-path tests pass. |
| A tool failure poisons agent status and makes an accepted follow-up report failure. | Installed | f1a258ca. Tool errors stay in the tool journal; receipt waits ignore earlier turn errors. Five delivery regressions pass. |
| A failed turn hides its live terminal; an unlaunched manager can incorrectly show Stop. | Installed | Runtime-derived processStatus separates process state from turn failure. Browser tests cover continued input, confirmed exit, and retry after a trust error. |
| Host stability after live evidence scans | Verified on c440232f | 248 open file records and zero agent workspace files: `/tmp/trellis-host-live-open-files.json`. |
| GitHub CI for PR 30 | External account limitation | Jobs fail before execution because recent account payments fail or the spending limit needs an increase. Annotation for job 104536278957: `/tmp/trellis-pr30-ci-annotations.json`. |

The first follow-up reaches Esme despite a CLI error from stale tool state. Its native receipt confirms delivery.
Evidence: `/tmp/trellis-host-live-followup.error` and `/tmp/trellis-host-live-builder-followup-result.json`.
The installed gate verifies fresh-repository trust, a deliberate tool failure without a failed agent, successful follow-up delivery, and two automatic heartbeats.
The user merges PR 30 after the test reaches Human Review. Main contains the merged guide.
After installation, the lead moves the test ticket to Done at 20:08:44 UTC. Evidence: `/tmp/trellis-final-test-ticket-done.json`.
The acceptance test does not change billing.

Process-status verification: 11 projection/API tests pass with 51 assertions. Terminal and manager browser cases pass, including pre-launch retry and continued input after failure.
Evidence: `/tmp/trellis-process-projection-green.log`, `/tmp/trellis-process-controls-final.log`, and `/tmp/trellis-failed-terminal-hook-final.log`.

## Final installation

The latest desktop release opens at 20:27:36 UTC on the macOS arm64 host.
The release ID is `d345422e628c94280f70488528e23bf2d0f78ce948f83e50fe7fe6c32593d035`, and the HTTP host reports PID 89102.
Hana retains PID 13113 and provider session `f8584a45-27db-465c-8008-a4eaa12dc273`. Seven other native processes also survive the HTTP host update.
The independent check confirms a healthy active release and open app. Evidence: `/tmp/trellis-full-manager-installed.json`.

The manual install script fails an assertion that expects a starting session's provider ID to stay empty.
The first launcher attempt reaches its 10-second login environment timeout and exits. launchd then starts the host.
The independent confirmation establishes the installed state. The user will perform the remaining UI check.

The earlier UI refresh includes product changes through `6fef93c3`.
The signed release ID is `2cba138f1eed2145b7e4a9a4891424fdc34118e48b808d6bdd6fe1393b30dd6a`.
The installed HTTP host reports PID 35176 at `http://127.0.0.1:4521`. The authenticated CLI reports healthy database and GitHub connections.
The app opens. Hana and four workers retain their PIDs and provider sessions through the UI update.
Evidence from 20:08:21 UTC: `/tmp/trellis-ui-refresh-preserved.json`.
At 20:09:19 UTC, Hana continues authenticated ticket work with no agent error. Her restored turn remains active.
The scratch manager proves heartbeat delivery. Evidence for Hana: `/tmp/trellis-hana-restored-monitor.jsonl`.

The prior host installation at `64d9dc12` matches the source server files and rebuilt runtime. Evidence: `/tmp/trellis-final-reliability-candidate.json`.
Its build, package, signature verification, all 13 packaged smoke checks, installation, and app launch pass.
Logs: `/tmp/trellis-final-reliability-{build,package,sign,smoke,install}.log`.

All nine workspace typechecks pass. Biome checks 2,251 files, and 15 repository tests pass with 106 assertions.
Evidence: `/tmp/trellis-workspace-typechecks-final-20260915.log`, `/tmp/trellis-final-reliability-lint.log`, and `/tmp/trellis-final-reliability-repo.log`.
The complete server suite reports 1,132 passed cases, 13 native opt-in skips, and zero failed cases. The worker-transport procedure suite also passes.
The command exits 1 because the global home guard detects the concurrent, authorized CLI installation at 19:56:51 UTC.
The guard compares modification times. Both `~/.local/bin` and its `trellis` file change during the suite, which runs from 19:50:48 to 19:58:51 UTC.
Evidence: `/tmp/trellis-server-integration-final-20260915.log`.

Implementation tasks use this session's subagents. TRL-71 serves as the live test of the installed ticket workflow.
That test covers builder assignment, follow-up delivery, a PR, local review findings, fixes, review approval, and process shutdown.

The final installed manager gate passes on release `ae02d6f5` with the same process and provider session throughout.
It covers a fresh repository, a deliberate shell failure, a successful follow-up receipt, and two automatic heartbeats.
The scratch manager stops, its project is archived, and its persona is deleted. Cleanup records zero errors.
Evidence: `/tmp/trellis-installed-heartbeat-t8cE7s/evidence.json` and `/tmp/trellis-installed-heartbeat-acceptance-final.log`.

The user also merges PR 27 and PR 28 while final checks run. Origin main advances to `eaa1ac2e`.
Merge 6fef93c3 integrates those UI changes. Test-only commit b346e0a5 corrects the collapsed-sidebar assertion.
The UI checks pass: 56 command and keyboard tests with 190 assertions, 13 browser cases, and the web typecheck.
Evidence: `/tmp/trellis-web-merge-command-tests.log` and `/tmp/trellis-web-merge-e2e-final.log`.
The UI package passes all 13 smoke checks. The manual install script times out while the launcher verifies and copies the resource bundle.
The launcher then finishes. The lead confirms the active package, healthy HTTP host, retained processes, and open app.
The initial install command does not pass. Evidence: `/tmp/trellis-ui-final-install.log` and `/tmp/trellis-ui-refresh-preserved.json`.
