# Host tests

Run the isolated process and host tests from the repository root:

```sh
bun run test:host
```

The tests use temporary directories and separate runtime processes. Native CLI tests require explicit credentials and model choices:

```sh
TRELLIS_NATIVE_ACCEPTANCE_HOME="$HOME" \
TRELLIS_NATIVE_CLAUDE_MODEL=claude-sonnet-5 \
TRELLIS_NATIVE_CODEX_MODEL=gpt-5.6-sol \
TRELLIS_NATIVE_PI_MODEL=vercel-ai-gateway/openai/gpt-4.1-mini \
TRELLIS_NATIVE_OPENCODE_MODEL=vercel/anthropic/claude-sonnet-4.6 \
bun run test:host:real
```

These model names match the recorded acceptance runs. Select models available to each authenticated CLI.
`TRELLIS_NATIVE_OPENCODE_BIN` selects an explicit OpenCode executable for its real tests.
OpenCode 1.18.31 passes the native control test. Version 1.4.11 fails initial prompt submission.
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

## AGY limit

AGY permits an explicit manual terminal launch. Its autonomous host operations report missing capabilities.
The tested CLI cannot isolate its hooks per attempt. An interrupt can also cancel its Stop hook before an idle confirmation.
These cases remain unverified for autonomous use.
