# Execution runtime

The Node runtime owns PTY and standard-stream processes. The Trellis host connects through an owner-only Unix socket. A host disconnect leaves processes active.

Build and start the runtime:

```sh
bun run --cwd apps/runtime build
node apps/runtime/dist/index.js --home /absolute/path/to/trellis/runtime
```

The desktop package supplies Node and the native `node-pty`, `fs-ext`, and `koffi` modules. The native modules must match that Node runtime. `TRELLIS_RUNTIME_NODE` selects the Node executable for integration tests.

The runtime acquires a kernel file lock before it opens state. A second daemon cannot change the first daemon's manifest or session records. After a crash, socket cleanup requires a refused connection and proof that the recorded PID no longer exists. A live or reused PID requires inspection.

The manifest contains the protocol version, daemon identifier, PID, start time, and socket path. The home directory permits only its owner. The socket, manifest, session records, and output files permit only their owner.

## Protocol

Import `RuntimeClient` from `@trellis/runtime-protocol/client`. Each call opens one socket connection. Requests and responses use newline-delimited JSON with protocol version 5.

| Method | Input | Result |
| --- | --- | --- |
| `hello` | None | Runtime identity |
| `shutdown` | None | Null after managed processes stop |
| `list` | None | All recorded sessions |
| `start` | Launch specification | Session |
| `input` | Session identifier, base64 bytes | Null |
| `deliver` | Session identifier, message identifier, base64 bytes | Written or unknown |
| `resize` | Session identifier, columns, rows | Null |
| `stop` | Session identifier | Session |
| `output` | Session identifier, byte offset | Base64 bytes and retained byte interval |

A launch specification holds `id`, `command`, `args`, `cwd`, and `mode`. Optional fields are `env`, `cols`, `rows`, and `timeoutMs`. A timeout must be between 1 millisecond and 24 hours. The runtime enforces it independently of host connections. A deadline stops the owned OS session and persists the timeout reason. The modes are `pty` and `stdio`. `separateStderr: true` retains standard error in its own log. `output(id, offset, "stderr")` reads that log. The host assigns a distinct identifier to each execution attempt.

A repeated launch identifier returns its existing session. A changed command under that identifier returns `LAUNCH_CONFLICT`. The runtime records the identifier before it starts the process. A stop before launch records cancellation, so a delayed launch cannot create a process.

A transport error after a request means the result is unknown. A caller reconciles a launch through its existing identifier. Keyed `deliver` calls persist the message identifier and byte hash before they write input. Repeated calls return the recorded outcome. An interrupted write remains unknown and never resends automatically. `written` means the runtime queued bytes, not that the agent accepted the message.

Input calls have no automatic resend. The host must preserve an unknown input result until its harness can establish receipt.

`running` describes a process. It does not establish agent readiness, a current turn, or useful output. After a runtime crash, prior active sessions become `unknown`. Their recorded identifiers cannot create replacement processes.

Each launch creates an OS session. The launch PID identifies that session while its processes remain. Koffi calls `getsid(2)` to identify live members. PTY jobs can use separate process groups within that session.

`stop` sends SIGKILL to every live process group in the owned OS session. While the launch leader remains live, the runtime also records the OS sessions of its observed descendants. Cleanup includes those sessions after the leader exits. Natural leader exit starts the same cleanup. Standard-stream processes retain output until their streams close.

The runtime reports `exited` only after those sessions contain no live processes. A failed identity query, refused signal, or two-second cleanup deadline records `unknown`. An unknown cleanup prevents a successful shutdown response. Recorded PIDs from another daemon instance never authorize signals.

This runtime is not a security sandbox. A descendant that calls `setsid(2)` and loses its parent before cleanup observes it can survive. Such a process requires separate inspection. The runtime does not claim containment of arbitrary programs.

## Output and lifetime

Each session retains the latest 1 MiB of output bytes in memory and on disk. The log records its absolute byte offset. An older read returns `truncated: true` and the first retained offset. PTY and standard-stream output preserve byte sequences through base64 transport.

Output files can contain repository content or credentials that a child prints. Environment values stay outside the session metadata. A command fingerprint includes their hash for launch conflict detection.

The `shutdown` request refuses sessions with unknown process ownership. An accepted request stops every managed process before it responds. It then closes the socket and releases the runtime lock. A graceful runtime shutdown stops its children. A client disconnect does not stop them. A hard runtime crash preserves recorded output and launch identifiers, but it cannot preserve a live terminal connection. The host must reconcile surviving processes before it creates another attempt.

The runtime uses bounded reads. It does not provide input ownership, a global log retention policy, or descriptor handoff across runtime upgrades. These require host or later protocol work.
