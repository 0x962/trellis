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

`launch.start(target, spec)` requires `spec.id === target.attemptId` and sends one `start` request. `prepare.descriptor` and `launch.confirmed` require the same of the id of their input. The answer is a `LaunchOutcome`:

- `kind: "receipt"`: the runtime accepted the launch. `session` is the runtime answer verbatim. `descriptorDigest` is the sha256 hex digest of the fingerprint of the prepared launch record, or null for a custom launch. A caller compares two digests for equality only.
- `kind: "unknown"`: the host did not observe the outcome. A request reached the socket and no answer came back. `reason` is `timeout` for the `RUNTIME_TIMEOUT` error of the client and `connection-closed` for a socket that closed before the reply. For `launch.confirmed` that request can be the start or a later request of the confirmation. The caller reads the state with `observe.inspect`. A repeat of `launch.start` with the same spec is safe.

Every other error propagates, including `LAUNCH_CONFLICT` and `SESSION_NOT_FOUND` from the runtime.

## Environment

A contract value carries at most the six values of `AttemptEnvironmentSchema`. They enter as the required `env` of the `ContractLaunchSpec` of `launch.start`. Every spec and every record that leaves the host has no `env`. `prepare.descriptor` and `files.descriptor` return the record without the environment of its spec. The fingerprint of the record embeds that environment, so the record carries its sha256 digest in `fingerprintDigest` instead, or null for a custom launch. `prepare.custom` returns the spec of the record it wrote without the environment. The full record stays on disk, and `launch.startPrepared` and `launch.confirmed` read it there.

`launch.start` merges the login environment of the host under `spec.env` before the runtime starts the process. An attempt value replaces a host value of the same name. The type of `spec.env` admits no other key, so the process receives the environment `nativeStart` builds.

`hostDefaultProfile`, the reader of the SuperSet default login pointer, is defined in `components/prepareHost.ts` and in `services/agentRuns/nativeStart.ts`.

## Launch confirmation and harness input

`launch.confirmed(target, input, mode)` prepares the launch of `input` again, starts it through the `HarnessHost`, and waits for the confirmation of the harness. `mode.kind` is `start` or `resume` with the provider session id. The receipt holds the confirmed process status.

`input.send`, `input.sendAtTurnBoundary`, and `input.interrupt` go through the `HarnessHost`, which frames the message for the harness of the attempt and uses the control socket of codex, opencode, and muse. `input.raw`, `input.deliver`, and `input.queue` write bytes to the runtime.

## Tests

- `LocalExecutionHost.runtime.test.ts` runs the shared contract fixture against the real runtime and a `/bin/cat` session.
- `LocalExecutionHost.lifecycle.test.ts` runs the adapter over a scripted runtime, checks the values `stopNative` and `refreshNative` read, the redaction of the launch record, and the delegation of `launch.confirmed` and the harness input to the `HarnessHost`.
