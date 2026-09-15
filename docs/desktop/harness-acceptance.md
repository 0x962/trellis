# Harness acceptance contract

## Scope and evidence

This contract covers Claude Code, Codex, Antigravity CLI (`agy`), OpenCode, and Pi. The terminal remains each harness's interactive CLI. Native hooks, plugins, and local control APIs supply structured observations. Terminal text and stored ticket state do not establish agent activity.

Inspection date: 2026-09-15. Commands executed: `command -v <binary>`, `<binary> --version`, and `<binary> --help` for each harness. Additional help: `codex resume`, `codex app-server`, `opencode run`, and `opencode serve`. These commands do not prove authenticated model execution.

| Harness | Installed version | Resolved executable |
|---|---|---|
| Claude Code | 2.1.272 | `/Users/navidkhan/.local/bin/claude` |
| Codex | 0.154.0 | `/opt/homebrew/bin/codex` |
| AGY | 1.0.6 | `/Users/navidkhan/.local/bin/agy` |
| OpenCode | 1.4.11 | `/opt/homebrew/bin/opencode` |
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
| AGY | `agy --dangerously-skip-permissions --model M --prompt-interactive P` | `agy --dangerously-skip-permissions --model M --conversation S --prompt-interactive P` | Installed help documents automatic tool approval. Capture `conversationId`. |
| OpenCode | `OPENCODE_PERMISSION='{"*":"allow"}' opencode --model M --prompt P` | `OPENCODE_PERMISSION='{"*":"allow"}' opencode --model M --session S --prompt P` | This is Trellis's current environment setting. Verify effective permissions through the installed configuration API. `--model` uses `provider/model`. |
| Pi | `pi --tools read,bash,edit,write,grep,find,ls --model M P` | `pi --tools read,bash,edit,write,grep,find,ls --model M --session S P` | Built-in tools have no approval prompt. Extensions can introduce their own approval flow. The tool allowlist alone cannot disable that flow. |

OpenCode's installed `run --help` exposes `--dangerously-skip-permissions`; its TUI help does not. Do not append the `run` flag to the TUI without version-specific evidence.

## Adapter capabilities

| Harness | Identity and activity | Responses and tools | Interrupt and control |
|---|---|---|---|
| Claude | `SessionStart.session_id`; `UserPromptSubmit.prompt`; `Stop`; `StopFailure`. | `Stop.last_assistant_message`; `PreToolUse`, `PostToolUse`, `PostToolUseFailure`. The current Trellis bridge registers only three events. | Ctrl+C interrupts an active operation. Stop does not fire for user interruption. A confirmed interruption needs an additional supported signal. [Hooks][claude-hooks], [controls][claude-controls] |
| Codex | Hooks provide `session_id`, `turn_id`, `model`, prompt submission, Stop, and Interrupt. | Tool hooks cover local function tools; hosted tools do not use that path. Stop provides `last_assistant_message`. | Native `Interrupt` confirms the interrupted turn. The app-server exposes `turn/interrupt(threadId, turnId)` and a completed event. [Hooks][codex-hooks], [app-server][codex-server] |
| AGY | Official hooks expose `conversationId`, `modelName`, `PreInvocation`, and `Stop`. Stop includes `terminationReason`, `error`, and `fullyIdle`. | `PreToolUse` and `PostToolUse` expose tool data. The documented hooks do not expose an exact submitted prompt receipt or final response field. | Escape halts active streams. Ctrl+C exits the CLI. No supported local cancellation API was established for installed 1.0.6. [Hooks][agy-hooks], [controls][agy-controls] |
| OpenCode | Plugin events include `session.created`, `session.status`, `session.idle`, and `session.error`. The session API returns the native ID. | Message and message-part events expose structured content. Plugins expose tool callbacks. | `/session/:id/abort` requests cancellation; session events establish completion. Default TUI interrupt is Escape. [Server][opencode-server], [plugins][opencode-plugins], [keys][opencode-keys] |
| Pi | An explicit `--extension` accesses `ctx.sessionManager.getSessionId()`, `before_agent_start`, `agent_start`, and `agent_end`. `ctx.isIdle()` exposes current activity. | `message_update` and `agent_end` expose messages. `tool_execution_start/update/end` expose correlated tool events. | The extension API exposes `ctx.abort()`. Escape aborts in the TUI. RPC mode has `abort`, but RPC replaces the TUI and is not the selected UI. |

Claude 2.1.272 adds `claude agents --json` for active interactive and background sessions. A read-only probe returned interactive `sessionId`, `pid`, `startedAt`, `status`, and optional `waitingFor` fields. Observed statuses included `idle` and `waiting`. This is a candidate for a targeted status read after interruption. Its update timing and completion semantics still need a real interrupt test. Background entries use a different `id` and `state` shape.

Pi's installed `docs/rpc.md` also defines `prompt`, `get_state`, and structured events. Its prompt response means accepted, queued, or handled; it is not necessarily an active turn. Use the extension API to retain the native TUI. Installed references: `docs/extensions.md`, `dist/core/extensions/types.d.ts`, and `dist/core/session-manager.d.ts`.

Codex's installed schemas distinguish thread, turn, and item events. A local app-server connection can supplement hooks while the native TUI remains attached. The adapter must connect to the same engine that owns the TUI session. A second engine must not resume or mutate that session concurrently.

AGY's current documentation can describe a newer release than installed 1.0.6. The binary contains the hook names, `conversationId`, and `transcriptPath`, as verified with `strings`. This proves identifiers exist, not event semantics. Do not infer prompt receipts from an invocation counter or parse the terminal for a response. Treat these acceptance cases as unresolved until a versioned native protocol or real hook evidence establishes them.

## What Superset supplies

Superset's [built-in commands][superset-builtins] use explicit resume IDs for these harnesses. Its AGY preset uses `--mode accept-edits`, which installed AGY 1.0.6 help does not expose.

Its [Claude and Codex adapter][superset-hooks] registers native hooks. The [Codex wrapper][superset-codex] enables hooks and bypasses hook trust. It also retains a compatibility log watcher. Trellis should use native events without that watcher.

Its [OpenCode plugin][superset-opencode] filters child sessions and maps busy/idle events. Its [Pi extension][superset-pi] maps agent and tool events to desktop notifications. The inspected `agent-setup` package has no AGY-specific hook adapter.

These notification adapters do not implement Trellis's full receipt, response, interruption, and elapsed-time contract.

## Trellis gaps at audit time

Source: [presets](../../packages/api/src/harness/harness.ts), [launch specification](../../apps/server/src/agents/native/interactiveLaunchSpec.ts), and [hook bridge](../../apps/server/src/agents/native/claudeHook.ts).

| Capability | Claude | Codex | AGY | OpenCode | Pi |
|---|---|---|---|---|---|
| Native TUI launch and terminal bytes | Present | Present | Present | Present | Present |
| Explicit vendor resume ID | Present | Uses `--last` | Uses `--continue` | Uses `--continue` | Uses `--continue` |
| Captured vendor ID | Chosen UUID | Missing | Missing | Missing | Missing |
| Typed model setting and effective-model evidence | Missing | Missing | Missing | Missing | Missing |
| Exact initial/follow-up receipt | Present | Missing | Missing | Missing | Missing |
| Structured final response | Stop hook | Missing | Missing | Missing | Missing |
| Structured tool stream | Missing | Missing | Missing | Missing | Missing |
| Authoritative busy/idle | Three-hook coverage | Missing | Missing | Missing | Missing |
| Verified interrupt outcome | Missing | Missing | Missing | Missing | Missing |
| Full acceptance sequence on installed release | Pending | Pending | Pending | Pending | Pending |

The shared runtime already supplies process inspection, stop, retained output, and timestamps. Cross-harness list filters and elapsed duration belong to that shared layer. Adapter events supply activity and tool state. A process exit and an agent turn failure remain separate outcomes.

[claude-hooks]: https://code.claude.com/docs/en/hooks
[claude-controls]: https://code.claude.com/docs/en/interactive-mode
[codex-hooks]: https://learn.chatgpt.com/docs/hooks
[codex-server]: https://learn.chatgpt.com/docs/app-server
[agy-hooks]: https://www.antigravity.google/docs/hooks/
[agy-controls]: https://www.antigravity.google/docs/cli/reference/
[opencode-server]: https://opencode.ai/docs/server
[opencode-plugins]: https://opencode.ai/docs/plugins
[opencode-keys]: https://opencode.ai/docs/keybinds
[superset-builtins]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/shared/src/builtin-terminal-agents.ts
[superset-hooks]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/agent-setup/src/agent-wrappers-claude-codex-opencode.ts
[superset-codex]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/agent-setup/templates/codex-wrapper-exec.template.sh
[superset-opencode]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/agent-setup/templates/opencode-plugin.template.js
[superset-pi]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/agent-setup/templates/pi-extension.template.ts
