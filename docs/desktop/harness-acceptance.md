# Harness acceptance contract

## Scope and evidence

This contract covers Claude Code, Codex, OpenCode, and Pi. The terminal remains each harness's interactive CLI. Native hooks, plugins, and local control APIs supply structured observations. Terminal text and stored ticket state do not establish agent activity.

Inspection date: 2026-09-15. Commands executed: `command -v <binary>`, `<binary> --version`, and `<binary> --help` for each harness. Additional help: `codex resume`, `codex app-server`, `opencode run`, and `opencode serve`. These commands do not prove authenticated model execution.

| Harness | Installed version | Resolved executable |
|---|---|---|
| Claude Code | 2.1.272 | `/Users/navidkhan/.local/bin/claude` |
| Codex | 0.154.0 | `/opt/homebrew/bin/codex` |
| OpenCode | 1.18.31 | `/opt/homebrew/bin/opencode` |
| Pi | 0.73.1 | `/opt/homebrew/bin/pi` |

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

## Native commands

`P` denotes a shell-quoted prompt, `M` an explicit model, and `S` the captured vendor session ID. These are native command forms, not claims that Trellis already implements them.

| Harness | Start | Resume by ID | Permission behavior |
|---|---|---|---|
| Claude | `claude --dangerously-skip-permissions --model M --session-id S P` | `claude --dangerously-skip-permissions --model M --resume S P` | Explicit bypass flag. New `S` must be a UUID. |
| Codex | `codex --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust --enable hooks --model M P` | `codex resume --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust --enable hooks --model M S P` | Tool bypass and hook trust are separate flags. Capture the generated session ID. |
| OpenCode | `OPENCODE_PERMISSION='{"*":"allow"}' opencode --model M --prompt P` | `OPENCODE_PERMISSION='{"*":"allow"}' opencode --model M --session S --prompt P` | This is Trellis's current environment setting. Verify effective permissions through the installed configuration API. `--model` uses `provider/model`. |
| Pi | `pi --tools read,bash,edit,write,grep,find,ls --model M P` | `pi --tools read,bash,edit,write,grep,find,ls --model M --session S P` | Built-in tools have no approval prompt. Extensions can introduce their own approval flow. The tool allowlist alone cannot disable that flow. |

OpenCode's installed `run --help` exposes `--dangerously-skip-permissions`; its TUI help does not. Do not append the `run` flag to the TUI without version-specific evidence.

## Adapter capabilities

| Harness | Identity and activity | Responses and tools | Interrupt and control |
|---|---|---|---|
| Claude | `SessionStart.session_id`; `UserPromptSubmit.prompt`; `Stop`; `StopFailure`. | `Stop.last_assistant_message`; `PreToolUse`, `PostToolUse`, `PostToolUseFailure`. The current Trellis bridge registers only three events. | Ctrl+C interrupts an active operation. Stop does not fire for user interruption. A confirmed interruption needs an additional supported signal. [Hooks][claude-hooks], [controls][claude-controls] |
| Codex | Hooks provide `session_id`, `turn_id`, `model`, prompt submission, Stop, and Interrupt. | Tool hooks cover local function tools; hosted tools do not use that path. Stop provides `last_assistant_message`. | Native `Interrupt` confirms the interrupted turn. The app-server exposes `turn/interrupt(threadId, turnId)` and a completed event. [Hooks][codex-hooks], [app-server][codex-server] |
| OpenCode | Plugin events include `session.created`, `session.status`, `session.idle`, and `session.error`. The session API returns the native ID. | Message and message-part events expose structured content. Plugins expose tool callbacks. | `/session/:id/abort` requests cancellation; session events establish completion. Default TUI interrupt is Escape. [Server][opencode-server], [plugins][opencode-plugins], [keys][opencode-keys] |
| Pi | An explicit `--extension` accesses `ctx.sessionManager.getSessionId()`, `before_agent_start`, `agent_start`, and `agent_end`. `ctx.isIdle()` exposes current activity. | `message_update` and `agent_end` expose messages. `tool_execution_start/update/end` expose correlated tool events. | The extension API exposes `ctx.abort()`. Escape aborts in the TUI. RPC mode has `abort`, but RPC replaces the TUI and is not the selected UI. |

Claude 2.1.272 adds `claude agents --json` for active interactive and background sessions. A read-only probe returned interactive `sessionId`, `pid`, `startedAt`, `status`, and optional `waitingFor` fields. Observed statuses included `idle` and `waiting`. Two real acceptance runs confirmed `idle` after Ctrl+C through one targeted query with the exact native session ID and PID. Background entries use a different `id` and `state` shape.

Pi's installed `docs/rpc.md` also defines `prompt`, `get_state`, and structured events. Its prompt response means accepted, queued, or handled; it is not necessarily an active turn. Use the extension API to retain the native TUI. Installed references: `docs/extensions.md`, `dist/core/extensions/types.d.ts`, and `dist/core/session-manager.d.ts`.

Codex 0.154.0 exposes `codex app-server --listen unix://PATH` and `codex --remote unix://PATH` in its installed help. The [terminal connection documentation][codex-terminal] describes this shared engine. Trellis does not yet implement this connection.

### Codex work to complete

The current adapter supplies hooks through `prepareCodex`. Its successful lifecycle tests cover local tools. Hosted tools such as WebSearch do not emit those tool hooks.

1. Start one private app-server for each attempt. Attach the native terminal and the Trellis event client to that server.
2. Map native thread, turn, tool, response, and error events into the host contract. Preserve exact thread and turn IDs.
3. Distinguish temporary provider errors from final failures through native events. The installed `ErrorNotification` schema includes `willRetry`.
4. Track the engine process separately from the terminal process. Confirm engine and child exit before a stop succeeds.
5. Test rejected credentials, unavailable models, rate limits, provider failures, dropped streams, hosted tools, reconnects, crashes, and interruption during provider retries.
6. Repeat the complete host lifecycle, desktop acceptance, and manager ticket workflow.

Evidence: installed CLI help and `/tmp/trellis-codex-0154-schema/v2/`. The `ThreadResumeParams` schema states that an existing running thread ID rejoins that thread. The [app-server documentation][codex-server] labels the app-server and WebSocket transport experimental. Trellis must verify this integration before it uses the connection for ticket work.

### Complete host acceptance

`apps/server/test/int/src/agents/harnessHost/real.test.ts` exercises `HarnessHost`, `RuntimeClient`, the native hook entry, and a separate runtime socket. Each case starts the installed native TUI with real provider credentials. The public host methods must confirm the initial receipt, effective model, provider session ID, file proof, tool events, and final response. The test also checks lists, elapsed duration, terminal resize, retained output, and streamed terminal bytes.

A filesystem event confirms that a shell command starts before `host.interrupt`. The host must report an interrupted outcome and preserve the process. A subsequent message must produce a response. After stop, exact-ID resume must recall the earlier private marker without tools.

Run from `apps/server`:

```sh
TRELLIS_REAL_HARNESS_ACCEPTANCE=1 TRELLIS_NATIVE_ACCEPTANCE_HOME=/path/to/authenticated/home TRELLIS_NATIVE_CLAUDE_MODEL=claude-sonnet-5 TRELLIS_NATIVE_CODEX_MODEL=gpt-5.6-sol TRELLIS_NATIVE_PI_MODEL=vercel-ai-gateway/openai/gpt-4.1-mini bun test test/int/src/agents/harnessHost/real.test.ts --test-name-pattern 'claude host|codex host|pi host'
```

The complete sequence passed for all three providers: 3 tests, 84 assertions, 53.43 seconds. Log: `/tmp/trellis-real-host-acceptance-fixed.log`. Each test retains its runtime files and evidence:

- Claude: `/tmp/trl-real-host-claude-oTLYlG`
- Codex: `/tmp/trl-real-host-codex-VHR9xQ`
- Pi: `/tmp/trl-real-host-pi-jzZCPV`

The first run exposed a Pi parser bug. Pi reported an aborted assistant message, but the parser omitted the interruption outcome. The regression maps native `stopReason: "aborted"` to `outcome: "interrupted"`. The host also requires that outcome before it confirms a hook-based interruption.

OpenCode 1.18.31 passed the same complete host sequence separately: 1 test, 28 assertions, 19.74 seconds. This case exercises the native control socket for prompt submission, interruption, and the resume prompt. Log: `/tmp/trellis-real-host-opencode.log`. Evidence: `/tmp/trl-real-host-opencode-dlvxQh`.

Run the OpenCode case with a verified 1.18.31 executable:

```sh
TRELLIS_REAL_HARNESS_ACCEPTANCE=1 TRELLIS_NATIVE_ACCEPTANCE_HOME=/path/to/authenticated/home TRELLIS_NATIVE_OPENCODE_MODEL=vercel/anthropic/claude-sonnet-4.6 TRELLIS_NATIVE_OPENCODE_BIN=/path/to/opencode-1.18.31/bin/opencode bun test test/int/src/agents/harnessHost/real.test.ts --test-name-pattern 'opencode host'
```

The override adds that executable's directory to the test host's PATH. The test does not update the installed CLI. The 1.4.11 result below does not satisfy acceptance. These host tests do not start ticket agents or exercise manager dispatch.

### Claude and Codex native acceptance

The opt-in suite starts each native TUI with its Trellis adapter and explicit model. It checks the native session ID, exact effective model, file edit, shell command, tool events, final response, and terminal bytes. A filesystem event confirms that a long shell command starts before Ctrl+C. The next message must complete in the same session. After process shutdown, exact-ID resume must recall the earlier private marker without tools.

Run from `apps/server`:

```sh
TRELLIS_REAL_HARNESS_ACCEPTANCE=1 TRELLIS_NATIVE_ACCEPTANCE_HOME=/path/to/authenticated/home TRELLIS_NATIVE_CLAUDE_MODEL=claude-sonnet-5 TRELLIS_NATIVE_CODEX_MODEL=gpt-5.6-sol bun test test/int/src/agents/harnesses/nativeAcceptance.test.ts
```

Both model variables require the full effective model ID. This suite makes real provider requests. Without the opt-in flag, both tests skip. The fixture retains native JSONL events, terminal bytes, and version metadata. Its shutdown waits for the owned process tree to exit.

Two runs passed on Claude 2.1.272 and Codex 0.154.0. The first took 57.75 seconds with 17 assertions. The second took 83.48 seconds with 18 assertions, including the production Claude status reader. Logs: `/tmp/trellis-native-acceptance-persisted.log` and `/tmp/trellis-native-acceptance-repeat.log`. The second run retains evidence in these directories:

- `/var/folders/zc/q6614tmx3tx362p94vvrfn0w0000gn/T/trellis-native-claude-qMnykl`
- `/var/folders/zc/q6614tmx3tx362p94vvrfn0w0000gn/T/trellis-native-codex-BhjJEJ`

The native events exposed two identity constraints. Claude can report the previous `prompt_id` in `UserPromptSubmit`, then report a new ID in `PreToolUse`. Codex can reuse a `turn_id` across an immediate follow-up. Both parsers omit the prompt receipt's turn ID. Tool and result events retain their native IDs. An interrupt must also match the activity timestamp; a turn ID alone does not identify the current operation.

These tests establish adapter behavior with real providers. They do not establish manager dispatch, missing-install errors, or all provider error and hosted-tool events.

### Codex provider-error observation

A bounded Codex 0.154.0 probe used two local Responses endpoints. One returned HTTP 401; the other returned HTTP 503. Each invocation selected a temporary provider with its own `base_url`, `requires_openai_auth=false`, and `request_max_retries=0`. These are native [provider configuration fields](https://learn.chatgpt.com/docs/config-file/config-reference). The probe changed no global configuration.

Both cases emitted `SessionStart` and `UserPromptSubmit`. Neither emitted Stop or an error hook within 15 seconds after the first local response. The 401 endpoint received 36 Responses requests; the 503 endpoint received 12. Codex continued requests despite the request retry setting. The probe stopped both owned process trees after approximately 17 seconds.

This result does not establish the final event after Codex exhausts its retries. It establishes that the current hook stream omitted provider failures during the observed interval. Provider errors therefore remain outside the verified errored-session contract. A live process with a received prompt does not prove that its provider request succeeds. Terminal text does not fill this gap.

Probe: `/tmp/trellis-codex-provider-error.ts`. Log: `/tmp/trellis-codex-provider-error.log`. The log records request methods, paths, response codes, and native events. Evidence:

- HTTP 401: `/var/folders/zc/q6614tmx3tx362p94vvrfn0w0000gn/T/trellis-native-codex-error-401-9cnZbe`
- HTTP 503: `/var/folders/zc/q6614tmx3tx362p94vvrfn0w0000gn/T/trellis-native-codex-error-503-5Pfrov`

### Pi native acceptance

The opt-in test starts the installed Pi TUI with the generated Trellis extension. It uses an explicit authenticated home and model. The test requires a file write, shell output, a completed result, a long tool interruption, and a successful follow-up. It then creates another session in the same directory and resumes the first session by its exact ID. The resumed model must recall the first session's private marker without a file read.

Run from `apps/server`:

```sh
TRELLIS_REAL_HARNESS_ACCEPTANCE=1 TRELLIS_NATIVE_ACCEPTANCE_HOME=/path/to/authenticated/home TRELLIS_NATIVE_PI_MODEL=vercel-ai-gateway/openai/gpt-4.1-mini bun test test/int/src/agents/harnesses/piReal.test.ts
```

`TRELLIS_NATIVE_PI_MODEL` requires an explicit provider/model. This test makes real provider requests and can incur charges. Without `TRELLIS_REAL_HARNESS_ACCEPTANCE=1`, the suite skips it. The helper retains terminal output and native event JSONL in its temporary evidence directory. It never derives activity from terminal text.

The repeatable test passed on Pi 0.73.1 in 19.57 seconds with 10 assertions and 27 native events. The explicit model was `vercel-ai-gateway/openai/gpt-4.1-mini`. A filesystem event confirmed the long shell command's marker before Escape. Session A was `01a0a643-3df2-710a-895b-aaf88760a56b`; session B was `01a0a643-735a-71c1-bde4-abdcf920b07f`. Evidence: `/tmp/trellis-real-pi-marker-final.log` and `/var/folders/zc/q6614tmx3tx362p94vvrfn0w0000gn/T/trellis-native-pi-OkJlqg`.

### OpenCode native acceptance

The earlier OpenCode 1.4.11 probe did not submit its initial `--prompt` argument. This occurred with explicit OpenAI and Vercel models. A manual Enter produced native prompt and tool events. The OpenAI request then returned a provider credential error. These observations do not establish a successful Trellis start or completed acceptance sequence. A provider credential error and a missing native prompt receipt are separate failures.

The installed Homebrew 1.18.31 executable now resolves through `/opt/homebrew/bin/opencode`. The old npm symlink previously selected 1.4.11. The command `brew link --overwrite opencode` replaced that symlink, and `opencode --version` returned `1.18.31`.

The repeat host test on this installed executable failed at its file proof assertion. The native session received the prompt and returned the requested marker, but it emitted no tool events and created no file. This run does not pass complete acceptance. Evidence: `/tmp/trellis-opencode-updated-host.log` and `/tmp/trl-real-host-opencode-Am0X4P`. The test stopped its owned processes.

## What Superset supplies

Superset's [built-in commands][superset-builtins] use explicit resume IDs for these harnesses.

Its [Claude and Codex adapter][superset-hooks] registers native hooks. The [Codex wrapper][superset-codex] enables hooks and bypasses hook trust. It also retains a compatibility log watcher. Trellis should use native events without that watcher.

Its [OpenCode plugin][superset-opencode] filters child sessions and maps busy/idle events. Its [Pi extension][superset-pi] maps agent and tool events to desktop notifications.

These notification adapters do not implement Trellis's full receipt, response, interruption, and elapsed-time contract.

## Trellis gaps before adapter work

Source: [presets](../../packages/api/src/harness/harness.ts), [launch specification](../../apps/server/src/agents/native/interactiveLaunchSpec.ts), and [hook bridge](../../apps/server/src/agents/native/claudeHook.ts).

| Capability | Claude | Codex | OpenCode | Pi |
|---|---|---|---|---|
| Native TUI launch and terminal bytes | Present | Present | Present | Present |
| Explicit vendor resume ID | Present | Uses `--last` | Uses `--continue` | Uses `--continue` |
| Captured vendor ID | Chosen UUID | Missing | Missing | Missing |
| Typed model setting and effective-model evidence | Missing | Missing | Missing | Missing |
| Exact initial/follow-up receipt | Present | Missing | Missing | Missing |
| Structured final response | Stop hook | Missing | Missing | Missing |
| Structured tool stream | Missing | Missing | Missing | Missing |
| Authoritative busy/idle | Three-hook coverage | Missing | Missing | Missing |
| Verified interrupt outcome | Missing | Missing | Missing | Missing |
| Full acceptance sequence on installed release | Pending | Pending | Pending | Pending |

The shared runtime already supplies process inspection, stop, retained output, and timestamps. Cross-harness list filters and elapsed duration belong to that shared layer. Adapter events supply activity and tool state. A process exit and an agent turn failure remain separate outcomes.

[claude-hooks]: https://code.claude.com/docs/en/hooks
[claude-controls]: https://code.claude.com/docs/en/interactive-mode
[codex-hooks]: https://learn.chatgpt.com/docs/hooks
[codex-server]: https://learn.chatgpt.com/docs/app-server
[codex-terminal]: https://learn.chatgpt.com/docs/app-server#connect-the-cli-terminal-ui
[opencode-server]: https://opencode.ai/docs/server
[opencode-plugins]: https://opencode.ai/docs/plugins
[opencode-keys]: https://opencode.ai/docs/keybinds
[superset-builtins]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/shared/src/builtin-terminal-agents.ts
[superset-hooks]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/agent-setup/src/agent-wrappers-claude-codex-opencode.ts
[superset-codex]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/agent-setup/templates/codex-wrapper-exec.template.sh
[superset-opencode]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/agent-setup/templates/opencode-plugin.template.js
[superset-pi]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/agent-setup/templates/pi-extension.template.ts
