# Desktop feedback

Owner: lead agent. Integration branch: `trellis-readiness-audit`.
Last update: 2026-09-15.

`Integrated` means that the source contains the change. It does not establish that the installed desktop uses that source.
The current release still awaits the host integration and installed acceptance checks. Hana stays stopped, and TRL and OP dispatch stay paused.

## Current work

| Feedback | Status | Owner | Verification |
| --- | --- | --- | --- |
| Show agent names instead of identifiers in activity and comments, including old entries. | Integrated | Lead and API agent | 26 API integration tests pass. The browser shows names in activity, comments, and thread labels. |
| Center the ticket content within the main panel. Keep the text left aligned. | Integrated | Layout agent | Browser geometry passes at wide desktop and mobile widths. |
| Make Activity the first and default ticket tab. | Integrated | Layout agent | Browser test passes. |
| Rename Overview to Agent. Show only agent content in Agent. | Integrated | Layout agent | Browser test passes; shared ticket details remain above the tabs. |
| Remove red bars from ticket cards. | Integrated | Card agent | Bars indicated failing CI. Two board browser tests pass after removal. |
| Show a full interactive CLI, like Superset, wherever agent output appears. | Native terminals integrated; external reviews show results | Lead and UI agent | Tickets, managers, and native flow tasks open interactive terminals. Dots owns separate processes; its review page links to the external run. |
| Remove output polls and the last-30-message view. | Integrated; final installation pending | Transport and UI agents | Native terminals use push streams. Dots results refresh on explicit action and do not expose a polled output panel. |
| Remove the manager queue from the manager page. | Integrated | UI agent | Manager page browser test passes. Durable dispatch stays in the host. |
| Use the actual process as the authority for agent status and metadata. Remove database state used to track process status. | Integrated | Runtime agent and lead | Migration 37 removes the state column and harness snapshots. API and page status uses live process inspection. |
| Remove the agent-attempt dropdown. Show the CLI of the agent assigned to the ticket. | Integrated | UI agent | The assigned-agent browser test passes. |
| Remove green dots next to agent avatars. | Integrated | UI agent | Shared avatar components and consumers updated. Component and browser checks pass. |
| Update builder prompts. Remove name prefixes, routine logs, and evidence bookkeeping from comments. | Saved and verified | Lead | Removed the instruction that requests name prefixes. The live builder persona limits comments and requires checks before review; its latest update is 17:25 UTC. |
| Every harness start command includes its permission-bypass flag or equivalent. | Integrated and saved | Lead | Claude, Codex, OpenCode, and Pi have native permission configuration. Both saved projects use bypass flags for start and resume. |
| Track all feedback in a Markdown file. Use subagents to fix and merge the work. | First batch merged and installed | Lead | Main contains the first batch. Live acceptance tests found further defects below. |

## Completed foundation and earlier feedback

| Feedback | Status | Evidence or limit |
| --- | --- | --- |
| Investigate manager readiness, missing triggers, duplicate agents, and activity without results. | Runtime fixes integrated; complete manager acceptance pending | Native process ownership, durable dispatch receipts, stable assignment IDs, and one active manager per project. |
| Learn from Superset and build a desktop host. Target macOS first, other platforms later. | Installed | Electron app and macOS background host. |
| Remove the Superset dependency and obsolete migration code. Manual one-time data handling is sufficient. | Installed | Native execution and selected local data home. |
| Let the desktop app use the existing data directory and provide native window controls. | Installed | Directory selection and macOS title bar. |
| Allow all tool permissions for the manager. | Installed | Built-in CLI commands enable all tool permissions. Both saved project commands match this setting. |
| Fix crashes and stuck runs caused by evidence file descriptor leaks. | Installed | Positional reads replace the leaking stream. Live repeated workspace scans retain zero workspace file descriptors. |
| Give the manager periodic heartbeats. Read and follow the manager prompt. | Installed | One idle minute; generation 50 acknowledged by Hana without a new process. |
| Keep manager comments useful. Send builder details directly, follow ticket scope, and avoid repeated blockers or questions. | Saved and verified after reinstall | The live manager persona contains the rules and reports an update at 17:16 UTC. |
| Do not repeat agent names and roles inside comments. | Manager and builder updated | The UI supplies the author name. |
| Rebuild, reinstall, and open the app after the changes. | Previous batch installed; current integration in progress | The lead owns the current desktop build, installation, and installed acceptance. |

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
| TRL-69: some agent commands return 401. | Source fixes integrated; installed acceptance pending | Commits 411110f0 and 06b959c5 fix the agent PATH and selected-home CLI credentials. Four authenticated procedure tests pass. |
| Act as manager and drive a ticket through the installed CLI. | Pending after the host gate | TRL-71 covers a builder, follow-up, PR, reviewer, and final handoff. |
| Keep Hana stopped. | Applied | The live runtime no longer lists Hana as running. Do not resume her as part of this test. |
| No hacks, shortcuts, or fallbacks. | Acceptance constraint | Each reproduced defect requires a regression test and a fix to its owning component. |

Hana acknowledged idle heartbeat generations 107 and 108 in process 17974 before the user stopped her. Both dispatches contain zero ticket events. Evidence: `/tmp/trellis-feedback-live-check.log`.

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

The process gate passes independently of a manager: 100 process/reconnect cycles retain 16 file descriptors. Two readers and replay match 2,097,409 binary bytes. The packaged host test confirms one PID for 12 concurrent starts, rejects a conflicting start, and preserves the PTY through an HTTP host restart. The four normal harness lifecycles have passed independent tests. Codex failure visibility and the installed OpenCode repeat remain incomplete.

## Independent host results

- Earlier independent runs pass on Claude 2.1.272, Codex 0.154.0, Pi 0.73.1, and OpenCode 1.18.31.
- The latest installed OpenCode repeat does not pass; see the result below.
- The four host cases contain 112 assertions across separate verified runs.
- Native tests cover file edits, shell output, provider IDs, explicit models, prompt receipts, tool events, interruption, follow-up, stop, and exact-ID resume.
- Host tests also verify pushed output, retained events, process lists, and elapsed time.
- Twelve concurrent starts produce one process. Twelve concurrent native resume requests produce one prompt.
- An uncertain native send remains inspectable and is not sent again after a host restart.
- The host requires OpenCode 1.18.31. The installed executable now resolves to that version.
- The packaged host smoke test passes authentication, CLI, PTY, process ownership, reconnect, stop, and host restart checks.
- Hana remains stopped. The independent tests do not dispatch manager work.

Commands and coverage: [Host tests](host-testing.md). Detailed evidence: [Harness acceptance](harness-acceptance.md).

Checks at commit 141794b9: `bun run test:host` passes 149 deterministic tests and skips eight native cases. Ten focused API tests, all nine workspace typechecks, lint, and 15 repository checks pass. The desktop build and packaged host smoke test passed at commit b3290a48. The current source changes await a desktop build and installation.

Codex provider failures remain outside the verified error contract. Local 401 and 503 probes produce session and prompt hooks but no error or Stop hook within 15 seconds. The CLI continues requests in that interval. Final failure behavior remains unverified.

The supported built-in harnesses are Claude, Codex, OpenCode, and Pi. The host requires native prompt receipts for each launch.

The latest installed OpenCode test failed because the model omitted the requested file edit and shell command. Launch, prompt receipt, and response observations succeeded. Evidence: `/tmp/trellis-opencode-updated-host.log`.

The [Codex plan](harness-acceptance.md#codex-work-to-complete) uses a private app-server with the native terminal attached. Its event mapping and failure tests remain pending.

## Current integration audit

| Request or finding | Status | Evidence or next check |
| --- | --- | --- |
| Connect the independent host to the app and manager. | In progress | Built-in launches must use HarnessHost through the existing agent APIs. |
| Complete Codex through one local app-server and its native terminal. | Delegated | Native errors, hosted tools, interruption, and engine ownership need acceptance tests. |
| Remove the unsupported harness entirely. | Integrated at 141794b9; installation pending | The supported list contains Claude, Codex, OpenCode, and Pi. |
| Use the updated OpenCode executable. | Installed executable verified | `opencode --version` returns 1.18.31. The latest file-edit acceptance assertion fails. |
| Show native flow tasks through their own terminal. | Source verified; installation pending | Six flow browser tests pass, including exact attempt selection and refusal to attach a replaced attempt. |
| Remove the polled Dots output panel. | Source verified; installation pending | The browser test verifies retained results, explicit refresh, the external Dots link, and no output polling. |
| Verify the saved manager and builder prompt rules. | Live read verified | Both prompts prohibit name prefixes, routine logs, repeated blockers, and questions about adjacent scope. |
| Preserve the user's pause. | Live read verified | All four Hana attempts report `exited`. TRL and OP both report `dispatchPaused: true`. |

The source audit confirms the centered ticket body, Activity default, Agent tab, assigned-agent terminal, avatar changes, and board card changes.
The manager page excludes the queue. The data selector and native macOS title bar remain present.
The actor resolver covers comments, activity, ticket summaries, actor filters, attachments, and PR links.

Live read commands: `trellis personas list --json`, `trellis projects show TRL --json`, `trellis projects show OP --json`, and `trellis agents list --project TRL --json`.
The authenticated wrapper reads the desktop token without printing it. These checks do not start or modify agents.

Output surface checks: six flow browser tests, one external review browser test, and two FlowProgress unit tests pass.
The UI typecheck and focused Biome checks pass. Evidence: `/tmp/trellis-output-surfaces-green.log`, `/tmp/trellis-review-results-green.log`, `/tmp/trellis-output-surfaces-final.log`, and `/tmp/trellis-flow-terminal-final.log`.
The final three-case run verifies terminal identity, focus, and explicit review refresh after the external-link role fix.
