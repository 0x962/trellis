# Desktop feedback

Owner: lead agent. Integration branch: `trellis-readiness-audit`.
Last update: 2026-09-15.

## Current work

| Feedback | Status | Owner | Verification |
| --- | --- | --- | --- |
| Show agent names instead of identifiers in activity and comments, including old entries. | Integrated | Lead and API agent | 26 API integration tests pass. The browser shows names in activity, comments, and thread labels. |
| Center the ticket content within the main panel. Keep the text left aligned. | Integrated | Layout agent | Browser geometry passes at wide desktop and mobile widths. |
| Make Activity the first and default ticket tab. | Integrated | Layout agent | Browser test passes. |
| Rename Overview to Agent. Show only agent content in Agent. | Integrated | Layout agent | Browser test passes; shared ticket details remain above the tabs. |
| Remove red bars from ticket cards. | Integrated | Card agent | Bars indicated failing CI. Two board browser tests pass after removal. |
| Show a full interactive CLI, like Superset, wherever agent output appears. | Integrated | Lead, transport agent, UI agent | Real Claude CLI acknowledged its initial prompt and a second message. Stop hooks returned READY and HEARTBEAT_OK. Resize and stop passed. |
| Remove output polls and the last-30-message view. | Integrated | Transport and UI agents | Push streams retain all terminal bytes. Browser input, external output, reconnect, and resize tests pass. |
| Remove the manager queue from the manager page. | Integrated | UI agent | Manager page browser test passes. Durable dispatch stays in the host. |
| Use the actual process as the authority for agent status and metadata. Remove database state used to track process status. | Integrated | Runtime agent and lead | Migration 37 removes the state column and harness snapshots. API and page status uses live process inspection. |
| Remove the agent-attempt dropdown. Show the CLI of the agent assigned to the ticket. | Integrated | UI agent | The assigned-agent browser test passes. |
| Remove green dots next to agent avatars. | Integrated | UI agent | Shared avatar components and consumers updated. Component and browser checks pass. |
| Update builder prompts. Remove name prefixes, routine logs, and evidence bookkeeping from comments. | Saved and verified | Lead | Removed the instruction that requests name prefixes. The builder persona now limits comments and requires checks before review. |
| Every harness start command includes its permission-bypass flag or equivalent. | Integrated and saved | Lead | Six preset tests pass. Both existing projects have verified start and resume commands with permission bypass. |
| Track all feedback in a Markdown file. Use subagents to fix and merge the work. | First batch merged and installed | Lead | Main contains the first batch. Live acceptance tests found further defects below. |

## Completed foundation and earlier feedback

| Feedback | Status | Evidence or limit |
| --- | --- | --- |
| Investigate manager readiness, missing triggers, duplicate agents, and activity without results. | Addressed in native runtime work; status redesign continues above | Native process ownership, durable dispatch receipts, stable assignment IDs, and one active manager per project. |
| Learn from Superset and build a desktop host. Target macOS first, other platforms later. | Installed | Electron app and macOS background host. |
| Remove the Superset dependency and obsolete migration code. Manual one-time data handling is sufficient. | Installed | Native execution and selected local data home. |
| Let the desktop app use the existing data directory and provide native window controls. | Installed | Directory selection and macOS title bar. |
| Allow all tool permissions for the manager. | Installed | Built-in CLI commands enable all tool permissions. Both saved project commands match this setting. |
| Fix crashes and stuck runs caused by evidence file descriptor leaks. | Installed | Positional reads replace the leaking stream. Live repeated workspace scans retain zero workspace file descriptors. |
| Give the manager periodic heartbeats. Read and follow the manager prompt. | Installed | One idle minute; generation 50 acknowledged by Hana without a new process. |
| Keep manager comments useful. Send builder details directly, follow ticket scope, and avoid repeated blockers or questions. | Saved and verified after reinstall | Current manager persona updated at 15:54 UTC. |
| Do not repeat agent names and roles inside comments. | Manager and builder updated | The UI supplies the author name. |
| Rebuild, reinstall, and open the app after the changes. | Previous batch installed; current batch pending | Final installation waits for the terminal and status changes. |

## Completion checks

- Keep the same ticket data, worktrees, and conversation history.
- Test live terminal input, output replay, resize, disconnection, and process exit.
- Confirm heartbeat delivery with the interactive CLI.
- Confirm that process status comes from live process inspection.
- Run the focused tests and required integration checks for each change.
- Review and merge the complete diff.
- Rebuild, sign, reinstall, open, and verify the installed app.


## Verification record for this batch

- Real CLI smoke: `/tmp/trellis-real-cli-smoke.log`.
- Actor names in the browser: `/tmp/trellis-actor-names-green.log`.
- All nine workspace type checks pass.
- Controller: 37 integration tests and 95 assertions pass.
- Runtime socket and status subscriptions: 24 tests and 136 assertions pass.
- The broad integration run stops at web bundle-size tests. Those performance checks are optional under the repository rules.
- Database migrations and schema checks pass. Drizzle reports no schema changes.
- Flow execution: 18 focused tests and 85 assertions pass, including PTY hooks, gates, cancellation, and retained output.
- CLI integration: 208 tests and 1,169 assertions pass.
- Runtime integration after review: 40 tests and 323 assertions pass.
- Server review fixes: 29 focused tests and 133 assertions pass.
- Repository checks: 15 tests and 106 assertions pass.
- Three Button/IconButton unit assertions fail in files unchanged since this batch started.
- Final server integration and installation checks continue.

## Reliability acceptance

| Finding or request | Status | Evidence |
| --- | --- | --- |
| Ticket summaries and actor filters still show IDs. | Fixed; final install pending | Commit d54e58d4; 18 API tests and the filtered board browser test pass. |
| GitHub PR batch timeouts incorrectly report authentication failure. | Fixed; final install pending | Commit dceff745; 131 GitHub integration tests pass. |
| TRL-70: send returns success before the initial CLI prompt exists. | Fixed; final install pending | Commits f510bfac and 595b0016; initial and follow-up receipts are required. Busy sends write no text. |
| A failed first controller tick prevents future ticks. | Fixed; final install pending | Commit 595b0016; the normal periodic tick continues after its logged error. |
| TRL-69: some agent commands return 401. | Agent path fixed; desktop launcher under review | Commit 411110f0; the second login shell selected the old source CLI. Four authenticated procedure tests pass. |
| Act as manager and drive a ticket through the installed CLI. | Pending after the host gate | TRL-71 covers a builder, follow-up, PR, reviewer, and final handoff. |
| Keep Hana stopped. | Applied | The live runtime no longer lists Hana as running. Do not resume her as part of this test. |
| No hacks, shortcuts, or fallbacks. | Acceptance constraint | Each reproduced defect requires a regression test and a fix to its owning component. |

Hana acknowledged idle heartbeat generations 107 and 108 in process 17974 before the user stopped her. Both dispatches contain zero ticket events. Evidence: `/tmp/trellis-feedback-live-check.log`.

## Required harness tests

Run the host gate before the manager acceptance ticket. Cover Claude, Codex, AGY, OpenCode, and Pi separately.

| Required behavior | Acceptance evidence |
| --- | --- |
| Start an agent | A real child process and initial provider readiness. |
| Start every supported harness | Separate cases for all five built-in harnesses. |
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

The process gate passes independently of a manager: 100 process/reconnect cycles retain 16 file descriptors. Two readers and replay match 2,097,409 binary bytes. The packaged host test confirms one PID for 12 concurrent starts, rejects a conflicting start, and preserves the PTY through an HTTP host restart. Harness-specific gates remain in progress.

## Independent host results

- Claude 2.1.272, Codex 0.154.0, Pi 0.73.1, and OpenCode 1.18.31 pass real host acceptance.
- The four host cases contain 112 assertions across separate verified runs.
- Native tests cover file edits, shell output, provider IDs, explicit models, prompt receipts, tool events, interruption, follow-up, stop, and exact-ID resume.
- Host tests also verify pushed output, retained events, process lists, and elapsed time.
- Twelve concurrent starts produce one process. Twelve concurrent native resume requests produce one prompt.
- An uncertain native send remains inspectable and is not sent again after a host restart.
- AGY remains limited to manual terminal use because its tested hooks cannot establish the complete autonomous contract.
- The installed OpenCode 1.4.11 fails initial prompt submission. The host requires the tested minimum, 1.18.31.
- The packaged host smoke test passes authentication, CLI, PTY, process ownership, reconnect, stop, and host restart checks.
- Hana remains stopped. The independent tests do not dispatch manager work.

Commands and coverage: [Host tests](host-testing.md). Detailed evidence: [Harness acceptance](harness-acceptance.md).

Final checks: `bun run test:host` passes 155 deterministic tests. Its eight native cases are opt-in and pass in the separate recorded runs. All nine workspace typechecks, lint, 15 repository checks, the desktop build, and the packaged host smoke test pass.

Codex provider failures remain outside the verified error contract. Local 401 and 503 probes produce session and prompt hooks but no error or Stop hook within 15 seconds. The CLI continues requests in that interval. Final failure behavior remains unverified.
