# Runtime client

`RuntimeClient` sends each RPC call through a separate Unix socket.
A call waits for its response or a transport failure by default.
The optional constructor argument `timeoutMs` sets a caller-selected socket idle timeout.
A paged `list` retains completed pages with `complete: false` when that explicit timeout expires.

`call(method, params, signal)` accepts an optional `AbortSignal`.
`hello(signal)`, `list(input, signal)`, and `listPage(input, signal)` also accept that signal.
A signal passed to `list` covers the capability request and every page.
Use `AbortSignal.timeout(milliseconds)` when an operation requires a caller-selected deadline.

Cancellation rejects with the signal reason and closes the request socket.
An aborted signal prevents the connection before dispatch.
After dispatch, cancellation stops the local wait; the runtime operation can still complete.
Read the saved runtime state before a repeat mutation.

# Execution contracts

`@trellis/runtime-protocol/execution` holds the host-bound interface over the runtime protocol.

- `ExecutionTargetSchema` names one attempt: `hostId`, `controlId`, `controllerOwnerEpoch`, `runId`, `attemptId`, and `generation`.
- `HostBindingSchema` is the `hostId`, `controlId`, and `controllerOwnerEpoch` one host instance serves.
- `assertTarget(binding, target)` throws `TargetMismatch` (code `EXECUTION_TARGET_MISMATCH`) when one of the three fields differs.
- `ExecutionHost<Prepare>` groups the operations: `health`, `prepare`, `launch`, `observe`, `input`, `stop`, `files`, `transcript`, and `terminal`. Every operation on one attempt takes the target first. `Prepare` names the input and the record of `prepare.descriptor` and the run record of `prepare.workspace`.
- `LaunchOutcome` is a `LaunchReceipt` or a `LaunchUnknown`. `startLaunch` maps the `RUNTIME_TIMEOUT` and the "connection closed" failures of the client to `LaunchUnknown` and lets every other error propagate.
- `AttemptEnvironmentSchema` is the strict set of six `TRELLIS_*` values a contract carries.
- `readAllOutput` pages one stream of a session to its end.

`@trellis/runtime-protocol/execution/contract-fixture` holds `executionHostContract(make)`, which registers the seven contract cases as `bun:test` cases, `scriptedRuntime(reply)`, a runtime stand-in on a Unix socket, and `clientExecutionHost`, the smallest host over one `RuntimeClient`.
