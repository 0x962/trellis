# Execution hosts

An execution host is the one way the server reaches the process of an attempt. The contract is `ExecutionHost` in `@trellis/runtime-protocol/execution`. This folder holds the local adapter and the factory.

## Factory

`createExecutionHosts({ local })` returns `{ get(hostId), local }`. `local` is the host of this machine. `get` returns the host that serves `hostId` and throws `UnknownExecutionHost` (code `EXECUTION_HOST_UNKNOWN`) for every other id.

## Binding

Every host serves one `HostBinding`: `hostId`, `controlId`, and `controllerOwnerEpoch`. The local binding comes from the hosts registry row of the local host and from the single control row. The caller of the factory reads those rows and passes the binding.

A caller of `createLocalExecutionHost` passes:

- `binding`: the binding above.
- `home`: the Trellis data home.
- `localUrl`: the URL agents on this machine call the server on.
- `env`: the login environment resolver of the host.
- `connection`: optional, a `LocalNativeConnection`. The default connects to the runtime socket under `home`.
- `log`: optional, the server log.

## Targets

Every operation that acts on one attempt takes an `ExecutionTarget` first. The host compares `hostId`, `controlId`, and `controllerOwnerEpoch` of the target with its binding before any socket or file system work. A different value gives a `TargetMismatch` (code `EXECUTION_TARGET_MISMATCH`) with the expected and the actual binding. The host-wide operations `health.hello`, `observe.list`, and `stop.shutdown` take no target.

## Launch outcome

`launch.start(target, spec)` requires `spec.id === target.attemptId` and sends one `start` request. The answer is a `LaunchOutcome`:

- `kind: "receipt"`: the runtime accepted the launch. `session` is the runtime answer verbatim, and `descriptorFingerprint` is the fingerprint of the prepared launch record, or null for a custom launch.
- `kind: "unknown"`: the request reached the socket and no answer came back. `reason` is `timeout` for the `RUNTIME_TIMEOUT` error of the client and `connection-closed` for a socket that closed before the reply. The caller reads the state with `observe.inspect`. A repeat of `launch.start` with the same spec is safe.

Every other error propagates, including `LAUNCH_CONFLICT` and `SESSION_NOT_FOUND` from the runtime.

## Environment

The contract carries only the six values of `AttemptEnvironmentSchema`. The local host adds its login environment and the account profile on its own side, inside `prepare`, so the agent environment is the one `nativeStart` builds. No contract value carries `TRELLIS_AUTH_TOKEN` or the login environment.

## Tests

- `LocalExecutionHost.runtime.test.ts` runs the shared contract fixture against the real runtime and a `/bin/cat` session.
- `LocalExecutionHost.lifecycle.test.ts` runs the adapter over a scripted runtime and checks the values `stopNative` and `refreshNative` read.
