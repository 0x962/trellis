# Runtime input boundary

Commit: `07077d79`.

A scratch child closes file descriptor 0, prints `ready`, and remains active with `sleep 60`. Before the fix, both `RuntimeClient.input` and `RuntimeClient.deliver` crash the daemon with an unhandled `write EPIPE`. The daemon exits with code 1 while the child remains active. The regression tests fail before the fix.

Standard-stream input now awaits the stream write callback. A failed write returns its error and retains the keyed delivery as `unknown`. The daemon records the input error while it retains the live PID, process handle, and deadline. The tests verify that daemon identity remains unchanged and explicit stop terminates the child. Protocol version 5 remains unchanged.

Concurrent calls with the same message identifier share one pending write. A changed payload fails before a second write. A delayed failure remains unknown after ledger reload and cannot resend the bytes.

From the repository root:

```sh
TRELLIS_RUNTIME_NODE="$PWD/node_modules/node/bin/node" bun test apps/runtime/test/int apps/runtime/src test/testLayout.test.ts
```

Result: 45 tests pass, 0 fail, 130 assertions. This includes the two closed-input regressions, two ledger tests, natural exit, explicit stop, timeout, shutdown, reconnect, and descriptor checks.

From `apps/server`:

```sh
TRELLIS_RUNTIME_NODE="$PWD/../../node_modules/node/bin/node" bun test test/int/src/services/agentRuns/nativeStart.test.ts test/int/src/services/agentRuns/nativeReconcile.test.ts test/int/src/services/agentRuns/nativeControl.test.ts test/int/src/services/flowExecutions test/int/src/services/evidence test/int/src/procedures/agentRuns.native.test.ts --timeout=30000
```

Result: 44 tests pass, 0 fail, 183 assertions.

Runtime TypeScript and Biome checks pass. An independent reviewer reports no defect and 27 focused runtime tests pass with 106 assertions. All process tests use scratch homes and the bundled Node 26.8.2 executable. The full server suite ran before this fix; the targeted server checks above ran after it.
