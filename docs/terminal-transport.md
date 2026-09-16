# Terminal transport

The terminal connects through one authenticated WebSocket per mounted terminal.
`GET /api/agent-runs/:id/terminal/socket` checks the host, origin, attempt, and optional provider session before the upgrade.
The connection retains the immutable attempt identifier.
Input and resize commands use the runtime client directly after attachment.

## Input

The browser sends JSON commands through its open socket:

```json
{"type":"input","data":"a","userInput":true}
{"type":"resize","cols":100,"rows":30}
```

The host serializes commands for that connection.
It preserves the `userInput` flag because terminal device replies do not represent a human prompt.
The browser returns from each send without a server acknowledgement.
The host closes a failed connection and discards commands that have not reached the runtime.
Reconnect never replays input.

The browser limits buffered input to 1 MiB.
The host limits pending commands to 1 MiB or 1,024 commands.
The runtime retains its existing private socket protocol and owns the native PTY.
Each private input request still uses its own Unix socket.
The database and OS process inspection participate in attachment and status observations, outside the per-keystroke path.

## Output

The runtime subscription reads retained output and sends live output through the same connection.
The host converts each output chunk to a binary WebSocket frame:

| Byte position | Content |
| --- | --- |
| 0–7 | Start byte offset, big-endian Float64 |
| 8–15 | Next byte offset, big-endian Float64 |
| 16 | Retained-buffer gap flag, 0 or 1 |
| 17 onward | Unmodified terminal bytes |

JSON frames carry process observations and errors.
The browser uses `arraybuffer` messages and passes bytes directly to xterm.
The renderer combines output chunks once per animation frame.
Each xterm write contains at most 1 MiB and waits for the previous parse callback.
A full batch can flush while the browser delays animation frames.

The renderer limits outstanding output to 8 MiB.
The host also limits its socket output buffer to 8 MiB.
An overflow closes the connection and exposes the reconnect control.
Accepted renderer bytes remain queued for display.
Reconnect requests the last parsed byte offset and removes overlap with bytes already queued locally.
A retained-buffer gap resets the terminal before the next available bytes.

## Display and lifecycle

The terminal loads the xterm WebGL addon after it opens.
GPU failure leaves the DOM renderer available.
Context loss releases the addon and refreshes the terminal.
Texture cleanup occurs after 32 atlas page additions.
Unmount cancels output, scheduled writes, GPU resources, and the runtime subscription.

The desktop header injector maps WebSocket schemes to the matching HTTP schemes for host authorization.
Navigation keeps its separate origin rule.
A desktop relaunch activates a changed header injector.
The compatible host update leaves the runtime and its agent processes alive.

## Superset investigation

The reference checkout was `superset-sh/superset` at `1019540c0be5069eb5ff3ebb22e5707a42e0999d`.
These modules supplied the design evidence:

| Module | Relevant behavior |
| --- | --- |
| `apps/desktop/src/renderer/lib/terminal/terminal-ws-transport.ts` | Immediate input sends, binary output, replay positions, detached-socket guards |
| `packages/host-service/src/terminal/terminal.ts` | Attached session lookup, direct PTY writes, socket output limit |
| `packages/host-service/src/terminal/DaemonClient/DaemonClient.ts` | Persistent private input channel |
| `apps/desktop/src/renderer/lib/terminal/write-coalescer.ts` | Frame batches and one active xterm parse batch |
| `apps/desktop/src/renderer/lib/terminal/terminal-addons.ts` | WebGL lifecycle, GPU failure, texture growth limit |

Trellis implements these transport and display concepts through its own modules.
Its attempt identifiers and retained output supply the identity and replay boundary.
Its compatible runtime protocol permits deployment while agent processes continue.
Superset's persistent private input channel remains a possible separate runtime change.

The [Hono WebSocket helper](https://hono.dev/docs/helpers/websocket) requires the Bun server argument and WebSocket handlers.
Header middleware skips upgrade responses because the helper can return immutable headers.
The [xterm addon API](https://xtermjs.org/docs/guides/using-addons/) supplies addon activation and disposal.

## Verification

Server tests exercise authenticated upgrades, rejected attempts, binary replay, process exit, ordered input, queue limits, and subscription cleanup.
An integration test rejects every database call after attachment and still receives keyboard input and resize commands at the runtime.
Client tests exercise immediate sends, concurrent output callbacks, cancellation, process exit, and input limits.
Renderer tests exercise frame batches, parser completion, duplicate replay, retained gaps, output limits, and GPU lifecycle.
The user tests the deployed terminal's appearance and interaction.
