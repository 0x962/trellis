# Harness acceptance contract

## Scope and evidence

This contract covers Claude Code, Codex, OpenCode, Pi, and Muse. The terminal remains each harness's interactive CLI, except for Muse, whose terminal is the transcript that the Trellis bridge prints. Native hooks, plugins, session protocols, and local control APIs supply structured observations. Terminal text and stored ticket state do not establish agent activity.

Inspection date: 2026-09-15. Commands executed: `command -v <binary>`, `<binary> --version`, and `<binary> --help` for each harness. Additional help: `codex resume`, `codex app-server`, `opencode run`, and `opencode serve`. These commands do not prove authenticated model execution.

| Harness | Installed version | Resolved executable |
|---|---|---|
| Claude Code | 2.1.272 | `/Users/navidkhan/.local/bin/claude` |
| Codex | 0.154.0 | `/opt/homebrew/bin/codex` |
| OpenCode | 1.18.31 | `/opt/homebrew/bin/opencode` |
| Pi | 0.73.1 | `/opt/homebrew/bin/pi` |
| Muse Code | 1.3.0 (1.3.0-R3233.1) | `/Users/navidkhan/.local/bin/muse` |

Superset source: `/Users/navidkhan/projects/superset`, commit `1019540c0be5069eb5ff3ebb22e5707a42e0999d`. Pi package source: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent`, version 0.73.1.

The installed Codex generated its protocol schemas with `codex app-server generate-json-schema --out /tmp/trellis-codex-0154-schema`. The result includes `TurnInterruptParams`, `ThreadStatusChangedNotification`, and `ItemStartedNotification`.

## Common contract

Keep four identities separate: Trellis assignment ID, runtime attempt ID, vendor session ID, and vendor turn ID. Resume selects the exact vendor session ID. Stop selects its currently owned runtime attempt. An interrupt targets the current turn and retains the session.

| Operation | Required behavior and acceptance evidence |
|---|---|
| Start | Resolve the executable, launch once, capture the vendor session ID, and await authoritative readiness. Concurrent duplicate requests return the same attempt. |
| Missing installation | Return the harness name and missing executable before a successful start response. Leave no live child or active assignment. |
| Permission bypass | Apply the harness's bypass setting on start and resume. Execute a file edit and shell command without an approval prompt. Report any effective policy that prevents this contract. |
| Session ID | Return the vendor session ID from its API or authenticated event. Never substitute a random Trellis ID for an unknown vendor ID. |
| Resume by ID | Stop session A, create session B in the same directory, then resume A by ID. A must recall its unique test marker. |
| Stop by ID | Stop the owned attempt and confirm process cleanup. Keep its vendor history available for resume. Stopping A must leave B live. |
| Model | Pass an explicit model on start and resume. Record the effective model from a vendor event or API. Reject an invalid model clearly. |
| Send | Return an accepted message or turn identity. Distinguish queued, accepted, rejected, and uncertain delivery. Repeat the same request ID without duplicate execution. |
| Output and responses | Stream ordered terminal bytes and structured response events. Preserve a complete final response associated with the correct turn. |
| Activity and tool events | Expose authoritative turn start, tool start/progress/end, and turn completion or failure. A live process alone does not mean busy. |
| List | List owned attempts with process status, agent activity, vendor session ID, and failure information. Preserve unknown activity when evidence is absent. |
| Elapsed time | Expose elapsed process time from recorded start and verified exit timestamps. Expose turn duration separately. Reconnect must not reset either duration. |
| Interrupt | Interrupt a long tool call, await the turn's interrupted outcome, and send another prompt. The same vendor session must answer it. Repeated or stale interrupts must not cancel a later turn. |

For each harness, first run deterministic adapter fixtures, then one isolated real CLI acceptance session. Test startup delay, busy sends, interruption, reconnect, crashes, and resume. Record versions, effective model, event identities, output, and exit evidence.

## Native adapters

Each adapter preserves the harness's interactive terminal. The runtime owns terminal output, process status, cleanup, and elapsed time.

| Harness | Launch and permission settings | Identity, activity, and control |
| --- | --- | --- |
| Claude | `--dangerously-skip-permissions`; optional `--model`; exact `--session-id` or `--resume`. | Eight native hooks report sessions, prompts, models, tools, results, and failures. Ctrl+C and `claude agents --json` confirm interruption against the exact session and PID. |
| Codex | One private app-server with `approval_policy="never"` and `sandbox_mode="danger-full-access"`; the native terminal attaches with `--remote`. | Native thread and turn APIs provide exact IDs, prompts, results, tools, errors, and interruption. Thread creation and resume validate effective model and permissions. |
| OpenCode | `OPENCODE_PERMISSION='{"*":"allow"}'`; generated configuration sets `permission: "allow"`; optional `--model` and exact `--session`. | The generated plugin reports session and tool events. A private control socket handles prompt submission and interruption. |
| Pi | Explicit built-in tools and a generated extension; optional `--model` and exact `--session`. | The extension reports native session identity, prompts, tool events, results, and abort outcomes. Built-in tools execute without approval prompts. |
| Muse | One private `muse serve` host per attempt with `--trust-workspace`; workers add `--disable-sandbox`, managers add `--disable-shell --disable-write`; `session/start` with `approvalMode: allowAll` and the model, or `session/resume` with the exact session id. | The Muse Session Protocol provides exact session and turn ids, prompt receipts, tool items, agent messages, results, failures, retries, and interruption. A private control socket handles prompt submission and interruption. |

Sources: [Claude](../../apps/server/src/agents/harnesses/claude/prepareClaude.ts), [Codex](../../apps/server/src/agents/harnesses/codex/bridgeEntry.ts), [OpenCode](../../apps/server/src/agents/harnesses/opencode/opencode.ts), [Pi](../../apps/server/src/agents/harnesses/pi/pi.ts), and [Muse](../../apps/server/src/agents/harnesses/muse/bridgeEntry.ts).

## Muse acceptance

Inspection date: 2026-09-16. Muse Code 1.3.0 exports its wire schema with `muse schema generate-ts`. The stable surface holds `session/start`, `session/resume`, `turn/start`, `turn/interrupt`, `turn/completed`, `item/started`, `item/completed`, `session/modelChanged`, `model/list`, and `usage/read`.
The session host speaks line-delimited JSON-RPC over stdio and accepts one client. Every command carries a UUIDv7 `commandId`. A session directory copied into another XDG data home resumes there.
A session that names an MCP server needs the `sessionMcp` capability, which the host grants only to a client that requests it at `initialize`. Without the request, `session/start` fails with error -32010. The bridge requests it and refuses a manager start when the grant is missing.
Muse has no terminal client that attaches to a session host, and its plugin hooks did not run under `exec` or the TUI in this inspection. The bridge prints the transcript and reads typed input in raw mode.
The session protocol has no field for a system prompt or a tool allowlist. A manager gets its persona through `AGENTS.md` in its private workspace, and the host flags remove shell and file writes. Muse keeps its base instructions and its read tools.
`usage/read` returns no window until a turn runs in the same host, and `usage/changed` follows each model call with a 5-hour window and a weekly window. The bridge saves that announcement to `muse/trellis-usage.json`, and the account card reads it.
The macOS Keychain holds the token of a Muse login. A managed Muse profile keeps its own `auth.json`, settings, and trust file; whether two profiles keep separate Keychain tokens is not verified.

| Check | Result | Evidence |
| --- | --- | --- |
| Deterministic host fixtures: identity, model, receipts, tools, terminal output, lists, resume, interrupt, prepared attempts, heartbeats, delivery errors, production host, restart | Written, not run in this change | `harnessHost.test.ts`, `preparedAttempt.test.ts`, `heartbeat.test.ts`, `deliveryErrors.test.ts`, `productionHost.test.ts`, `restartAgents.process.test.ts` with the `museServe.ts` fixture |
| Real worker through `muse serve` on `meta/muse-spark-1.3`: session id, model, prompt receipt, shell tool call with its file result, follow-up through the control socket, stop | Passes on 2026-09-16 in 28 seconds through `HarnessHost` with the installed runtime | `/tmp/trellis-muse-smoke-cSexof/events.jsonl` |
| Real interrupt of a sleeping shell tool and exact-session resume that recalls its marker | Passes on 2026-09-16 in 28 seconds; the tool ends with `cancelled by tool cancellation` and the resumed session answers with the marker | `/tmp/trellis-muse-smoke-Ywt7Zn` |
| Real manager through `muse serve` with the Trellis MCP server: persona in `AGENTS.md`, shell and writes disabled, the model lists every `trellis_*` tool | Passes on 2026-09-16 in 11 seconds after the `sessionMcp` request; the first installed manager start failed with -32010 before it | Host log request `c50a92dd-07b8-4891-ac78-124684e276fb`, then `/tmp/trellis-muse-manager-smoke-1lS1o7` |
| Real lifecycle in the acceptance suite | Pending | `real.test.ts` with `TRELLIS_NATIVE_MUSE_MODEL` |

## Codex acceptance

The Codex bridge owns one app-server and one native terminal. The terminal and Trellis event client share the same engine and thread.
The bridge reads native hook hashes through `hooks/list`. It trusts those hashes for that invocation and preserves the user's hooks.
The bridge validates `approvalPolicy: "never"` and `sandbox.type: "dangerFullAccess"` from the native thread response.
The adapter maps native items for shell commands, file changes, MCP tools, hosted tools, and final responses.
Provider errors retain `willRetry`. A temporary error keeps the turn active; a final failure supplies the failed outcome.

| Check | Result | Evidence |
| --- | --- | --- |
| Real lifecycle with native terminal, hooks, tools, interrupt, follow-up, stop, and exact resume | 1 test, 29 assertions pass, including real hosted WebSearch | `/tmp/trellis-codex-appserver-final-real.log` |
| Native provider failures, dropped streams, retry interruption, hooks, engine crashes, transport loss, and terminal cleanup | 11 tests, 43 assertions pass | `/tmp/trellis-tool-errors-native-faults-final.log` |
| Tool failures and receipt waits after a failed turn | Deterministic regressions pass | `/tmp/trellis-tool-errors-and-delivery-host-final.log` |
| Packaged desktop and manager ticket workflow | Desktop installed; earlier packaged gate passes 13 checks; TRL-71 is Done | Installed manager gate passes follow-up delivery and two heartbeats with one process and session |

The native failure tests use the installed Codex engine with isolated local Responses endpoints.
They verify final failure through native events, including `willRetry: false`.
The retry case observes `willRetry: true`, then confirms an interrupted outcome.
These tests use temporary provider settings and do not change the user's global configuration.

## Independent native runs

The [real host suite](../../apps/server/test/int/src/agents/harnessHost/real.test.ts) starts isolated runtime processes with the installed native CLIs.
Each case verifies the provider ID, effective model, initial receipt, file edit, shell output, tool events, final result, and terminal bytes.
A filesystem event confirms that a long shell command starts before interruption.
The same session must answer the next message. Exact-ID resume must recall its earlier private marker without tools.
The suite also checks process lists, elapsed time, resize, retained output, and pushed output.

| Harness | Measured result | Evidence |
| --- | --- | --- |
| Claude 2.1.272 | Complete host sequence passes; the native adapter repeat confirms interruption through the production status reader. | `/tmp/trellis-real-host-acceptance-fixed.log`, `/tmp/trellis-native-acceptance-repeat.log` |
| Codex 0.154.0 | Current shared-engine sequence passes: 29 assertions, including hosted WebSearch. | `/tmp/trellis-codex-appserver-final-real.log` |
| OpenCode 1.18.31 | Current installed executable passes: 27 assertions, 22.37 seconds. | `/tmp/trellis-host-wire-real-opencode.log` |
| Pi 0.73.1 | Complete host sequence passes; the separate native test records 10 assertions and 27 events. | `/tmp/trellis-real-host-acceptance-fixed.log`, `/tmp/trellis-real-pi-marker-final.log` |

[Host test commands](host-testing.md) specify the required credentials and explicit model settings.
The tests retain temporary event journals and terminal output. Each test stops its owned processes.
The OpenCode repeat retains evidence in `/tmp/trl-real-host-opencode-RFr2in`.

## What Superset supplies

Superset's [built-in commands][superset-builtins] use explicit resume IDs for these harnesses.

Its [Claude and Codex adapter][superset-hooks] registers native hooks. The [Codex wrapper][superset-codex] enables hooks and bypasses hook trust. It also retains a compatibility log watcher. Trellis should use native events without that watcher.

Its [OpenCode plugin][superset-opencode] filters child sessions and maps busy/idle events. Its [Pi extension][superset-pi] maps agent and tool events to desktop notifications.

These notification adapters do not implement Trellis's full receipt, response, interruption, and elapsed-time contract.

## App integration

Built-in agent assignments use the same [HarnessHost](../../apps/server/src/agents/harnessHost/harnessHost.ts) that the independent tests exercise.
The production [start service](../../apps/server/src/services/agentRuns/nativeStart.ts) supplies project model settings and the assignment token.
The host retains exact attempt and provider identities through send, interrupt, stop, and resume.
A live provider session prevents a second manager process.

The production host cases and interrupt boundary regression pass: 12 tests and 86 assertions.
They cover all five harnesses, missing executables, assignment authentication, stale interrupt targets, and actionable errors when the runtime is unavailable.
Evidence: `/tmp/trellis-interrupt-boundary-green.log`.

The installed desktop drives TRL-71 through builder work, review fixes, and Human Review. Both agents stop with retained workspaces and output.
The user merges PR 30. After the app update, the lead completes TRL-71 through the CLI at 20:08:44 UTC.
Release d345422e opens at 20:27:36 UTC. Hana and seven other native processes survive the HTTP host update.
The [feedback record](feedback.md#final-installation) tracks the installed checks, command failures, and remaining user UI check.

[superset-builtins]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/shared/src/builtin-terminal-agents.ts
[superset-hooks]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/agent-setup/src/agent-wrappers-claude-codex-opencode.ts
[superset-codex]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/agent-setup/templates/codex-wrapper-exec.template.sh
[superset-opencode]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/agent-setup/templates/opencode-plugin.template.js
[superset-pi]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/agent-setup/templates/pi-extension.template.ts
