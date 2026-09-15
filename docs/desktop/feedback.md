# Desktop feedback

Owner: lead agent. Integration branch: `trellis-readiness-audit`.
Last update: 2026-09-15.

`Integrated` means that the source contains the change. It does not establish that the installed desktop uses that source.
Desktop source c440232f is installed and opens. Live ticket acceptance found three further defects; their fixes await the final installation.
The user starts Hana and enables TRL dispatch at 19:50 UTC. Final installation must preserve that current choice and recheck it afterward.

## Current work

| Feedback | Status | Owner | Verification |
| --- | --- | --- | --- |
| Show agent names instead of identifiers in activity and comments, including old entries. | Installed at c440232f | Lead and API agent | 26 API integration tests pass. The browser shows names in activity, comments, and thread labels. |
| Center the ticket content within the main panel. Keep the text left aligned. | Installed at c440232f | Layout agent | Browser geometry passes at wide desktop and mobile widths. |
| Make Activity the first and default ticket tab. | Installed at c440232f | Layout agent | Browser test passes. |
| Rename Overview to Agent. Show only agent content in Agent. | Installed at c440232f | Layout agent | Browser test passes; shared ticket details remain above the tabs. |
| Remove red bars from ticket cards. | Installed at c440232f | Card agent | Bars indicated failing CI. Two board browser tests pass after removal. |
| Show a full interactive CLI, like Superset, wherever agent output appears. | Installed at c440232f; external reviews show results | Lead and UI agent | Tickets, managers, and native flow tasks open interactive terminals. Dots owns separate processes; its review page links to the external run. |
| Remove output polls and the last-30-message view. | Installed at c440232f | Transport and UI agents | Native terminals use push streams. Dots results refresh on explicit action and do not expose a polled output panel. |
| Remove the manager queue from the manager page. | Installed at c440232f | UI agent | Manager page browser test passes. Durable dispatch stays in the host. |
| Use the actual process as the authority for agent status and metadata. Remove database state used to track process status. | Installed at c440232f | Runtime agent and lead | Migration 37 removes the state column and harness snapshots. API and page status uses live process inspection. |
| Remove the agent-attempt dropdown. Show the CLI of the agent assigned to the ticket. | Installed at c440232f | UI agent | The assigned-agent browser test passes. |
| Remove green dots next to agent avatars. | Installed at c440232f | UI agent | Shared avatar components and consumers updated. Component and browser checks pass. |
| Update builder prompts. Remove name prefixes, routine logs, and evidence bookkeeping from comments. | Saved and verified | Lead | Removed the instruction that requests name prefixes. The live builder persona limits comments and requires checks before review; its latest update is 17:25 UTC. |
| Every harness start command includes its permission-bypass flag or equivalent. | Installed at c440232f and saved | Lead | Claude, Codex, OpenCode, and Pi have native permission configuration. Both saved projects use bypass flags for start and resume. |
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
| Rebuild, reinstall, and open the app after the changes. | c440232f installed; final fixes await installation | The lead owns the current desktop build, installation, and installed acceptance. |

## Completion checks

- Keep the same ticket data, worktrees, and conversation history.
- Test live terminal input, output replay, resize, disconnection, and process exit.
- Confirm heartbeat delivery with the interactive CLI.
- Confirm that process status comes from live process inspection.
- Run the focused tests and required integration checks for each change.
- Review and merge the complete diff.
- Rebuild, sign, reinstall, open, and verify the installed app.


## Verification evidence

The earlier UI and reliability changes have focused API, browser, runtime, CLI, and schema checks.
Evidence includes `/tmp/trellis-real-cli-smoke.log`, `/tmp/trellis-actor-names-green.log`, and the current source checks below.
Candidate c440232f passes all 13 packaged smoke checks and is installed. Evidence: `/tmp/trellis-host-final-install.log` and `/tmp/trellis-host-final-candidate.json`.

## Reliability acceptance

| Finding or request | Status | Evidence |
| --- | --- | --- |
| Ticket summaries and actor filters still show IDs. | Installed at c440232f | Commit d54e58d4; 18 API tests and the filtered board browser test pass. |
| GitHub PR batch timeouts incorrectly report authentication failure. | Installed at c440232f | Commit dceff745; 131 GitHub integration tests pass. |
| TRL-70: send returns success before the initial CLI prompt exists. | Installed at c440232f | Commits f510bfac and 595b0016; initial and follow-up receipts are required. Busy sends write no text. |
| A failed first controller tick prevents future ticks. | Installed at c440232f | Commit 595b0016; the normal periodic tick continues after its logged error. |
| TRL-69: some agent commands return 401. | Installed builder and reviewer verified | The live agents read the brief, health, and local review list. Builder HTTP evidence: `/tmp/trellis-host-live-builder-http.log`. |
| Act as manager and drive a ticket through the installed CLI. | Live workflow reaches Human Review | Esme opens PR 30, addresses Wren's two findings, and Wren approves the fixes at 349dd33b. Both agents stop through the CLI. |
| Preserve the user's manager choice. | User resumes Hana at 19:50 UTC | The earlier pause stays in effect until the user starts the manager and enables TRL dispatch. Final installed state requires another check. |
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

The process gate passes independently of a manager: 100 process/reconnect cycles retain 16 file descriptors. Two readers and replay match 2,097,409 binary bytes. The packaged host test confirms one PID for 12 concurrent starts, rejects a conflicting start, and preserves the PTY through an HTTP host restart. All four harness lifecycles pass independent tests. Codex native failure checks and the updated OpenCode repeat also pass. Final installed regression checks remain pending.

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
| Connect the independent host to the app and manager. | Installed at c440232f | Production host tests cover start, send, interrupt, stop, exact resume, and the single-manager constraint. |
| Complete Codex through one local app-server and its native terminal. | Installed at c440232f; final runtime fixes await installation | Shared-engine lifecycle passes 29 assertions. Native failure tests pass 43 assertions. |
| Remove the unsupported harness entirely. | Installed at c440232f | The supported list contains Claude, Codex, OpenCode, and Pi. |
| Use the updated OpenCode executable. | Installed executable and complete host sequence verified | Version 1.18.31 passes 27 assertions, including file edit, shell tools, interruption, and resume. |
| Show native flow tasks through their own terminal. | Installed at c440232f | Six flow browser tests pass, including exact attempt selection and refusal to attach a replaced attempt. |
| Remove the polled Dots output panel. | Installed at c440232f | The browser test verifies retained results, explicit refresh, the external Dots link, and no output polling. |
| Verify the saved manager and builder prompt rules. | Live read verified | Both prompts prohibit name prefixes, routine logs, repeated blockers, and questions about adjacent scope. |
| Preserve the user's current manager choice. | Final state check pending | The user manually resumes Hana and TRL dispatch at 19:50 UTC. The final update must retain her session and restore that choice. |

The source audit confirms the centered ticket body, Activity default, Agent tab, assigned-agent terminal, avatar changes, and board card changes.
The manager page excludes the queue. The data selector and native macOS title bar remain present.
The actor resolver covers comments, activity, ticket summaries, actor filters, attachments, and PR links.

Live read commands: `trellis personas list --json`, `trellis projects show TRL --json`, `trellis projects show OP --json`, and `trellis agents list --project TRL --json`.
The authenticated wrapper reads the desktop token without printing it. These checks do not start or modify agents.

Output surface checks: six flow browser tests, one external review browser test, and two FlowProgress unit tests pass.
The UI typecheck and focused Biome checks pass. Evidence: `/tmp/trellis-output-surfaces-green.log`, `/tmp/trellis-review-results-green.log`, `/tmp/trellis-output-surfaces-final.log`, and `/tmp/trellis-flow-terminal-final.log`.
The final three-case run verifies terminal identity, focus, and explicit review refresh after the external-link role fix.

## Live ticket acceptance and final fixes

TRL-71 reaches Human Review with [PR 30](https://github.com/0x962/trellis/pull/30) at commit `349dd33b`.
Esme writes the guide, links the PR, registers evidence, and receives follow-up instructions through the installed CLI.
Wren reviews the guide, posts two Margin findings, and approves the fixes after a second review. Both findings are resolved.
The CLI stops both agents and retains their worktrees, provider IDs, and all 520,531 bytes of builder output.
Evidence: `/tmp/trellis-host-live-rereview-result.json` and `/tmp/trellis-host-live-stop-evidence.json`.

| Defect or condition | Status | Evidence |
| --- | --- | --- |
| A fresh approved repository still prompts for native Claude trust. | Source fixed; final installation pending | a6740542 and a077219a. Fresh-repository lifecycle passes 28 assertions; profile preservation and relative-path tests pass. |
| A tool failure poisons agent status and makes an accepted follow-up report failure. | Source fixed; final installation pending | f1a258ca. Tool errors stay in the tool journal; receipt waits ignore earlier turn errors. Five delivery regressions pass. |
| A failed turn hides its live terminal; an unlaunched manager can incorrectly show Stop. | Source fixed; final installation pending | Runtime-derived processStatus separates process state from turn failure. Browser tests cover continued input, confirmed exit, and retry after a trust error. |
| Host stability after live evidence scans | Verified on c440232f | 248 open file records and zero agent workspace files: `/tmp/trellis-host-live-open-files.json`. |
| GitHub CI for PR 30 | External account limitation | Jobs fail before execution because recent account payments fail or the spending limit needs an increase. Annotation for job 104536278957: `/tmp/trellis-pr30-ci-annotations.json`. |

The first follow-up reaches Esme despite a CLI error from stale tool state. Its native receipt confirms delivery.
Evidence: `/tmp/trellis-host-live-followup.error` and `/tmp/trellis-host-live-builder-followup-result.json`.
Final installed acceptance must confirm successful follow-up responses, fresh-repository trust, and heartbeat continuity after the runtime fixes.
PR 30 remains open. The acceptance test does not change billing or merge the test PR.

Process-status verification: 11 projection/API tests pass with 51 assertions. Terminal and manager browser cases pass, including pre-launch retry and continued input after failure.
Evidence: `/tmp/trellis-process-projection-green.log`, `/tmp/trellis-process-controls-final.log`, and `/tmp/trellis-failed-terminal-hook-final.log`.
