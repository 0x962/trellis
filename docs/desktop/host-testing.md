# Host tests

Run the isolated process and host tests from the repository root:

```sh
bun run test:host
```

The tests use temporary directories and separate runtime processes. Native CLI tests require OpenCode 1.18.31 or later, explicit credentials, and model choices:

```sh
TRELLIS_NATIVE_ACCEPTANCE_HOME="$HOME" \
TRELLIS_NATIVE_CLAUDE_MODEL=claude-opus-5 \
TRELLIS_NATIVE_CODEX_MODEL=gpt-5.6-sol \
TRELLIS_NATIVE_PI_MODEL=vercel-ai-gateway/openai/gpt-5.6-sol \
TRELLIS_NATIVE_OPENCODE_MODEL=vercel/anthropic/claude-opus-5 \
bun run test:host:real
```

The examples use Opus 5 for Anthropic and Sol for OpenAI. Select models available to each authenticated CLI.
`TRELLIS_NATIVE_OPENCODE_BIN` selects an explicit OpenCode executable for its real tests.
OpenCode 1.18.31 passes the complete native host sequence.
Native tests create provider sessions and use the provider account. Each test stops its owned processes.

## Coverage

| Requirement | Test surface |
| --- | --- |
| Start an agent and each harness | `harnessHost.test.ts`, native adapter tests, `harnessHost/real.test.ts` |
| Clear missing executable error | `harnessHost.test.ts` |
| Permission bypass on start and resume | Adapter argument tests and real file edits and shell commands |
| Native session ID and exact resume | Native tests create separate conversations and resume the selected ID |
| Stop by ID | Host tests and runtime process inspection tests |
| Explicit model | Native events must match the requested model |
| Send messages | Host tests require an exact native prompt receipt |
| Complete output and responses | Runtime output subscription tests and real host subscriptions |
| Status and tool events | Authenticated observations and actual process inspection |
| Running, idle, and failed session lists | Host tests and runtime process query tests |
| Elapsed process time | Runtime process query tests and real host tests |
| Interrupt and continue | Native tests prove the shell starts, interrupt it, and send another message |
| Duplicate requests | Concurrent host starts share one process; conflicting requests fail |
| Restart and reconnect | Runtime recovery tests and the packaged host smoke test |
| Resource cleanup | One hundred process cycles and concurrent readers preserve the initial descriptor count |

Server tests live under `apps/server/test/int/src/agents/`. Runtime tests live under `apps/runtime/test/int/src/`.
The [acceptance record](harness-acceptance.md) contains versions, models, evidence paths, and provider limits.

## Codex engine checks

The native failure suite uses the installed Codex engine with temporary local provider settings:

```sh
cd apps/server
TRELLIS_REAL_HARNESS_ACCEPTANCE=1 bun test test/int/src/agents/harnessHost/codexFailures.test.ts
```

It tests HTTP 400, 401, 429, and 503 responses, dropped response streams, and interruption during a provider retry.
Native events must distinguish temporary errors from final failures through `willRetry`.
The suite also verifies that terminal exit stops the owned engine.
The acceptance record distinguishes these source checks from installed desktop and manager acceptance.

## Manager tool readiness

Run the interactive Claude manager tests with an authenticated home and an available model:

```sh
cd apps/server
TRELLIS_REAL_MANAGER_READY=1 \
TRELLIS_NATIVE_ACCEPTANCE_HOME="$HOME" \
TRELLIS_NATIVE_CLAUDE_MODEL=claude-opus-5 \
bun test test/int/src/agents/harnessHost/managerReady.real.test.ts
```

The first case delays tool discovery, calls the project tool, and repeats the call after exact-session resume.
The second case delays discovery beyond the startup deadline. It requires a failed start, no prompt receipt, and no project call.
Both cases use isolated runtimes and a temporary HTTP fixture. The first case requires provider inference.
