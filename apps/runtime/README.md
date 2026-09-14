# Execution runtime

The Node runtime owns PTY and standard-stream processes. The Trellis host connects through an owner-only Unix socket. A host disconnect leaves processes active.

Build and start the runtime:

```sh
bun run --cwd apps/runtime build
node apps/runtime/dist/index.js --home /absolute/path/to/trellis/runtime
```

The desktop package supplies Node and the native `node-pty` and `fs-ext` modules. The native modules must match that Node runtime. `TRELLIS_RUNTIME_NODE` selects the Node executable for integration tests.

The runtime acquires a kernel file lock before it opens state. A second daemon cannot change the first daemon's manifest or session records. After a crash, socket cleanup requires a refused connection and proof that the recorded PID no longer exists. A live or reused PID requires inspection.

The manifest contains the protocol version, daemon identifier, PID, start time, and socket path. The home directory permits only its owner. The socket, manifest, session records, and output files permit only their owner.

## Protocol

Import `RuntimeClient` from `@trellis/runtime-protocol/client`. Each call opens one socket connection. Requests and responses use newline-delimited JSON with protocol version 2.

| Method | Input | Result |
| --- | --- | --- |
| `hello` | None | Runtime identity |
| `list` | None | All recorded sessions |
| `start` | Launch specification | Session |
| `input` | Session identifier, base64 bytes | Null |
| `deliver` | Session identifier, message identifier, base64 bytes | Written or unknown |
| `resize` | Session identifier, columns, rows | Null |
| `stop` | Session identifier | Session |
| `output` | Session identifier, byte offset | Base64 bytes and retained byte interval |

A launch specification holds `id`, `command`, `args`, `cwd`, and `mode`. Optional fields are `env`, `cols`, and `rows`. The modes are `pty` and `stdio`. `separateStderr: true` retains standard error in its own log. `output(id, offset, "stderr")` reads that log. The host assigns a distinct identifier to each execution attempt.

A repeated launch identifier returns its existing session. A changed command under that identifier returns `LAUNCH_CONFLICT`. The runtime records the identifier before it starts the process. A stop before launch records cancellation, so a delayed launch cannot create a process.

A transport error after a request means the result is unknown. A caller reconciles a launch through its existing identifier. Keyed `deliver` calls persist the message identifier and byte hash before they write input. Repeated calls return the recorded outcome. An interrupted write remains unknown and never resends automatically. `written` means the runtime queued bytes, not that the agent accepted the message.

Input calls have no automatic resend. The host must preserve an unknown input result until its harness can establish receipt.

`running` describes a process. It does not establish agent readiness, a current turn, or useful output. After a runtime crash, prior active sessions become `unknown`. Their recorded identifiers cannot create replacement processes.

`stop` sends SIGKILL to the process groups of the session and its descendants. It waits for the child exit event. This targets local process execution, not a security sandbox. A process that deliberately escapes its recorded process tree requires separate inspection.

## Output and lifetime

Each session retains the latest 1 MiB of output bytes in memory and on disk. The log records its absolute byte offset. An older read returns `truncated: true` and the first retained offset. PTY and standard-stream output preserve byte sequences through base64 transport.

Output files can contain repository content or credentials that a child prints. Environment values stay outside the session metadata. A command fingerprint includes their hash for launch conflict detection.

A graceful runtime shutdown stops its children. A client disconnect does not stop them. A hard runtime crash preserves recorded output and launch identifiers, but it cannot preserve a live terminal connection. The host must reconcile surviving processes before it creates another attempt.

The first protocol uses bounded reads rather than subscriptions. It does not provide input ownership, a global log retention policy, or descriptor handoff across runtime upgrades. These require host or later protocol work.
