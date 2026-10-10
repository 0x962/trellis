# Execution runtime

The Node runtime owns PTY and standard-stream processes. The Trellis host connects through an owner-only Unix socket. A host disconnect leaves processes active.

Build and start the runtime:

```sh
bun run --cwd apps/runtime build
node apps/runtime/dist/index.js --home /absolute/path/to/trellis/runtime
```

The desktop package supplies Node and the native `node-pty`, `fs-ext`, and `koffi` modules. The native modules must match that Node runtime.

The runtime acquires a kernel file lock before it opens state. A second daemon cannot change the first daemon's manifest or session records. After a crash, socket cleanup requires a refused connection and proof that the recorded PID no longer exists. A live or reused PID requires inspection.

The manifest contains the protocol version, daemon identifier, PID, start time, and socket path. The home directory permits only its owner. The socket, manifest, session records, and output files permit only their owner.

## Protocol

Import `RuntimeClient` from `@trellis/runtime-protocol/client`. Each call opens one socket connection. Requests and responses use newline-delimited JSON with protocol version 12.

| Method | Input | Result |
| --- | --- | --- |
| `hello` | None | Runtime identity |
| `shutdown` | None | Null after managed processes stop |
| `list` | None | Every retained session |
| `start` | Launch specification | Session |
| `input` | Session identifier, base64 bytes | Null |
| `deliver` | Session identifier, message identifier, base64 bytes | Written or unknown |
| `resize` | Session identifier, columns, rows | Null |
| `stop` | Session identifier | Session |
| `output` | Session identifier, byte offset | Base64 bytes and retained byte interval |

A launch specification holds `id`, `command`, `args`, `cwd`, and `mode`. Optional fields are `env`, `cols`, `rows`, and `timeoutMs`. A timeout must be a positive safe integer of milliseconds. The runtime enforces it independently of host connections. [Node.js accepts one timer delay through 2,147,483,647 milliseconds](https://nodejs.org/api/timers.html#settimeoutcallback-delay-args). The runtime divides a larger deadline into supported timer segments. A deadline stops the owned OS session and persists the timeout reason. The modes are `pty` and `stdio`. `separateStderr: true` retains standard error in its own log. `output(id, offset, "stderr")` reads that log. The host assigns a distinct identifier to each execution attempt.

A repeated launch identifier returns its existing session. A changed command under that identifier returns `LAUNCH_CONFLICT`. The runtime records the identifier before it starts the process. A stop before launch records cancellation, so a delayed launch cannot create a process.

A transport error after a request means the result is unknown. A caller reconciles a launch through its existing identifier. Keyed `deliver` calls persist the message identifier and byte hash before they write input. Repeated calls return the recorded outcome. An interrupted write remains unknown and never resends automatically.

Standard-stream writes await the stream callback before they record `written`. PTY writes record `written` when the terminal accepts the write call. Neither outcome establishes that the agent accepted the message.

A child can close standard input while it remains active. A failed write returns its error and retains an unknown keyed delivery. The runtime records the input error without changing process ownership or status. The process remains available for `stop`, and its deadline remains active.

Input calls have no automatic resend. The host must preserve an unknown input result until its harness can establish receipt.

The runtime checks owned agents every 30 seconds. It stops a process tree after more than 30 idle minutes when the provider reports idle and has a saved conversation. Active tools, pending questions, unacknowledged messages, and recent human input prevent this stop. Terminal responses and window resizes do not extend the clock.

Idle expiry records `stopReason: "idle"` and preserves the saved conversation on disk for resume. New input receives `SESSION_IDLE_STOPPED` before delivery. The host resumes the conversation for a new message and releases the prior record after the new attempt starts. Explicit stop and session deletion also release the record.

The runtime retains other exited records and their output files for up to seven days, with a limit of 500 records. A `list` result omits a removed session. An `inspect` or `output` call for a removed session returns `SESSION_NOT_FOUND`.

`running` describes a process. It does not establish agent readiness, a current turn, or useful output. After a runtime crash, prior active sessions become `unknown`. Their recorded identifiers cannot create replacement processes.

Each launch creates an OS session. The launch PID identifies that session while its processes remain. Koffi calls `getsid(2)` to identify live members. PTY jobs can use separate process groups within that session.

`stop` sends SIGKILL to every live process group in the owned OS session. While the launch leader remains live, the runtime also records the OS sessions of its observed descendants. Cleanup includes those sessions after the leader exits. Natural leader exit starts the same cleanup. Standard-stream processes retain output until their streams close.

The runtime reports `exited` only after those sessions contain no live processes. A failed identity query, refused signal, or two-second cleanup deadline records `unknown`. An unknown cleanup prevents a successful shutdown response. Recorded PIDs from another daemon instance never authorize signals.

This runtime is not a security sandbox. On macOS, a descendant that calls `setsid(2)` and loses its parent before cleanup observes it can survive. Such a process requires separate inspection. The runtime does not claim containment of arbitrary programs.

The process code of each host is in `src/platform/`. `src/platform/platform.ts` loads the macOS or the Linux implementation for the current host.

## Linux

The runtime supports Ubuntu 24.04 with glibc on x86_64 and arm64. A Linux launch requires a cgroup v2 subtree that is delegated to the runtime user, for example a systemd unit with `Delegate=yes`. Without that subtree, the launch fails with an error that starts with `Linux agent launch requires a delegated cgroup v2 subtree`.

Each launch starts `/bin/sh`. The shell creates a new cgroup `trellis-attempts/<home tag>/launch-<UUID>` below the runtime cgroup, moves itself into it, and then runs the agent with the same PID. The home tag is the first 16 hexadecimal digits of the SHA-256 hash of the resolved runtime home path. If the launch directory exists, the launch fails with exit code 125. Every descendant of the agent starts in that cgroup. A descendant stays in the cgroup after `setsid(2)` and after the exit of its parent.

`stop` writes `cgroup.kill` to the cgroup of the launch and to the launch cgroup of each live process in the OS session. The runtime reports `exited` after `cgroup.events` shows `populated 0` and the OS session has no live process. Then it removes the cgroup. A session with live processes outside every launch cgroup fails the stop at once. A process that moves itself to another cgroup it can write, such as a new systemd user scope, and stays in the OS session keeps the stop `unknown` after two seconds.

A Linux process identity is `linux:<boot ID>:<PID>:<start ticks>`. The boot ID comes from `/proc/sys/kernel/random/boot_id`, and the start ticks come from `/proc/<pid>/stat`. A reboot or a reused PID gives a different identity. A macOS identity is `<PID>:<start seconds>:<start microseconds>`.

An agent continues to run after a runtime restart. At start, the new runtime adopts the launch cgroup of each recovered leader whose identity matches its record. Then it stops and removes every other `launch-*` cgroup below its own home tag, and it writes one `linux-launch-sweep` JSON line for each to standard error, with the PIDs it held. The runtime start waits for the sweep, and a sweep error stops the start. A cgroup that stays populated is logged and kept. A stop also finds the launch cgroup of a live process in `/proc/<pid>/cgroup`. Two runtimes in one cgroup have different homes, so neither sweep touches the launches of the other runtime. `.github/workflows/linux-process-lifecycle.yml` runs the real process cases on both architectures.

## Output and lifetime

Each session retains the latest 1 MiB of output bytes in memory and on disk. The log records its absolute byte offset. An older read returns `truncated: true` and the first retained offset. PTY and standard-stream output preserve byte sequences through base64 transport.

Output files can contain repository content or credentials that a child prints. Environment values stay outside the session metadata. A command fingerprint includes their hash for launch conflict detection.

The `shutdown` request refuses sessions with unknown process ownership. An accepted request stops every managed process before it responds. It then closes the socket and releases the runtime lock. A graceful runtime shutdown stops its children. A client disconnect does not stop them. A hard runtime crash preserves recorded output and launch identifiers, but it cannot preserve a live terminal connection. The host must reconcile surviving processes before it creates another attempt.

The runtime uses bounded reads. It does not provide input ownership, a global log retention policy, or descriptor handoff across runtime upgrades. These require host or later protocol work.
