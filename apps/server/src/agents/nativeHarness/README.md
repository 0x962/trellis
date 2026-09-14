# Claude structured adapter

The adapter targets Claude Code 2.1.270. It uses persistent standard streams and keeps the conversation UUID separate from the runtime attempt identifier. Custom command templates retain their interactive transport until they pass an adapter contract.

`claudeLaunchSpec` selects print mode, JSON input and output, verbose records, user replay, manual permissions, and the standard-stream permission handler. It selects `--resume` for an existing conversation. It never enables permission bypass.

Claude print mode skips its workspace trust dialog. The host must obtain a trusted-project choice before it selects this adapter. A Git worktree is not a sandbox.

## Host integration

1. Start the specification from `claudeLaunchSpec` through the runtime.
2. Deliver `claudeInitialize(initializeId)` with a persistent initialization identifier.
3. Wait for the matching control response through `observeClaude` or `waitForClaude`.
4. Call `sendClaude` with a persistent message UUID and the prompt.
5. Mark delivery accepted only after `acknowledgedMessageIds` contains that UUID.
6. Expose each pending permission request for an explicit decision.
7. Deliver `claudePermissionResponse` with a distinct persistent response identifier.
8. Treat a result as turn completion and evaluate the ticket's required evidence separately.

A runtime `written` result records a byte write. It does not acknowledge the agent's receipt. A timeout or an unknown write must not trigger another message UUID or an automatic resend.

`ClaudeStream` parses incremental UTF-8 bytes. It accepts only matching session records. Replayed user records require `isReplay: true`; tool-result records cannot acknowledge a prompt. A buffer gap or invalid JSON leaves the observation unknown.

The snapshot includes ready, working, idle, needs_input, failed, or unknown state. It includes text for the user and assistant transcript. It also includes message acknowledgements, pending permissions, the final result, and an error reason. Protocol records remain outside the transcript.

A result with permission denials remains needs_input even when Claude labels the result success. A permission response applies to one request. The formatter does not change persistent permission settings.

`observeClaude` reads the retained stdout log. The caller also reconciles the runtime session status. Retained output alone cannot establish that a process remains alive. The runtime keeps stderr separate so diagnostics cannot corrupt JSON records.

## Certification evidence

The local probes ran on 2026-09-14 with the installed executable. They used existing authentication and a scratch directory. They changed no configuration and granted no tool permission.

| Probe | Observed result |
| --- | --- |
| No-tools CLI prompt | Matching session UUID, exact replay UUID, `TRELLIS_HARNESS_OK`, exit 0 |
| Permission request | A Write request through `can_use_tool`; explicit denial; no file; nonempty `permission_denials` |
| Trellis runtime transport | Initialization ready with zero acknowledgements; exact replay UUID; `TRELLIS_RUNTIME_CLAUDE_OK` |
| Conversation resume | Same conversation UUID; a new message acknowledgement; `TRELLIS_RUNTIME_RESUME_OK` |

The sanitized success and denial records live under `apps/server/test/fixtures/nativeHarness`. Raw local probe records live under `/tmp/trellis-harness-cert`. Those temporary files are evidence for this run, not a repository test dependency.

The tests cover fragmented bytes, session mismatch, gaps, false acknowledgements from tool results, permission denial, launch arguments, and transcript extraction. Runtime tests cover keyed delivery, unknown outcomes, restart persistence, and separate stderr.

This certification does not establish unrestricted unattended repository work. Tool approval, project trust, controller persistence, and output evidence require the host integration tests. It does not certify another installed Claude version.

## Sources

The installed `claude --help` describes stream formats, replay acknowledgements, print-mode trust, and permission modes. The public [CLI reference](https://code.claude.com/docs/en/cli-reference) documents the command interface.

The official [streaming input guide](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) describes persistent message input. The SDK's [query implementation](https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/query.py) defines initialization and permission control messages. Its [subprocess transport](https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/transport/subprocess_cli.py) supplies the permission-handler flag. The local probes verify these records against the installed executable.

The host saves the byte cursor and partial JSON record with each observation. This permits a restart after part of a UTF-8 character arrives. Unread output that expires makes the harness state unknown. Consumed output can expire without loss of state.

The transcript retains up to 512 KiB of text. The result retains up to 512 KiB separately. `transcriptTruncated` and `resultTruncated` identify partial text. The public snapshot holds the latest 128 message receipts. `hasNativeReceipt` reads all receipts for an attempt from the database. `waitForNativeHarness` uses these receipts when the caller supplies `messageId`.
