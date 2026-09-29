# Native runtime recovery

`createNativeRuntimeWorker` supplies the database worker operations.
`observe` calls the real native runtime for the saved attempt.
It holds `withAttemptOperation` through inspection and the observation transactions.
`recover` uses the original private launch snapshot through `recoverNativeAttempt`.
Only a reserved handle can launch; every other state requires observation.
The existing bridge validates authority, admission, attempt identity, and deadlines before launch.

The worker factory requires `recordWorkspace` and `dispatchGate`.
The projection service records the workspace observation in the caller transaction.
The native dispatch adapter validates committed reservation or launch evidence before it settles a permit.

`runtimeState` and `runtimeAcknowledge` accept only the system actor.
Every operation checks the execution host.
The state reader enumerates retained executions and attempts in keyset pages of 100 rows.
The acknowledgment transaction preserves both the native completion receipt and its outbox receipt.
It verifies the original request, engine wait, step, run, attempt, and result digest.

`nativeRuntimeTransport` connects four internal services:

| Service | Registration |
| --- | --- |
| `langflowNative.runtimeState` | Core read: `runtimeState` |
| `langflowNative.runtimeObserve` | Prepared mutation: worker `observe`, then return its result |
| `langflowNative.runtimeRecover` | Prepared mutation: worker `recover`, then return its result |
| `langflowNative.runtimeAcknowledge` | Core mutation: `runtimeAcknowledge` |

`createNativeRuntimeConnection` supplies `committed({ executionId })` and `recover()`.
The host owns their shared queue, periodic calls, abort signal, and shutdown order.
It supplies the real engine client through `withEngine(authority, callback)`.
That callback must bind the client to the current supervisor owner and private authentication file.
The receipt archive supplies the original issued authority bytes.
The projection refresh runs after native observation and completion acknowledgment transactions commit.

Completion delivery reads the original engine wait from `/trellis-v1/native/visit`.
The visit must retain `engineWaitId`, `waitBytes`, and the exact original `requestBytes`.
An unresolved `native_reservation` wait remains pending.
`/trellis-v1/native/lookup` checks for an existing receipt before `/trellis-v1/native/completions` accepts a new result.
A lost response causes one receipt lookup, not another submission in that call.
Unknown replies preserve the completion outbox and dispatch permit.
A recovered receipt must match the original result bytes and engine wait.

Each engine delivery holds a durable permit.
After acknowledgment, the host archives the committed receipt and settles that permit.
Startup also settles permits whose acknowledgment committed before a host crash.
Cancellation withdraws new completion delivery and retains late native output for audit.
An unresolved engine effect remains pending until real receipt or cancellation evidence resolves it.
Native result acceptance does not establish process exit; the stop service retains that responsibility.

## Verification scope

The source fixtures cover lost replies, uncertain lookup, receipt conflicts, cancellation, and atomic acknowledgment.
The transport fixtures use a controlled HTTP boundary and do not prove engine execution.
The database rollback fixture throws an error; it does not kill a writer process.
The complete batch must run these fixtures and the actual composed native process checks.
The earlier process evidence remains under `integrations/langflow/tests/nativeLifecycle/` and its ticket attachments.

Deferred commands:

```sh
cd apps/server
bun test src/services/langflowNative/runtime/completionEngine/completionEngine.test.ts src/services/langflowNative/runtime/state/state.test.ts
bun test src/services/langflowNative/runtime/connection/connection.test.ts
bun run typecheck
```

Biome must cover the TypeScript files in this directory after the execution hold ends.
Source publication does not establish a successful test, Review, installed host, or release.
