# Terminal transport

The terminal connects through one authenticated WebSocket per retained terminal instance.
`GET /api/agent-runs/:id/terminal/socket` checks the host, origin, attempt, and optional provider session before the upgrade.
The connection retains the immutable attempt identifier.
Input and resize commands use the attached runtime channel directly.

## Input

The browser sends JSON commands through its open socket:

```json
{"type":"input","data":"a","userInput":true}
{"type":"resize","cols":100,"rows":30}
```

The runtime consumes commands in order on that connection.
It preserves the `userInput` flag because terminal device replies do not represent a human prompt.
The browser returns from each send without a server acknowledgement.
The host closes a failed connection and discards commands that have not reached the runtime.
Reconnect never replays input.

The browser limits buffered input to 1 MiB.
The runtime limits pending commands to 1 MiB or 1,024 commands.
The runtime owns the native PTY.
Protocol 10 advertises the additive `terminal-channel` capability.
The host opens one private Unix socket per terminal connection.
A JSON attachment request selects the immutable attempt and replay offset.
Length-prefixed binary frames then carry raw input, resize commands, output, status, and errors.
Input and resize do not require a runtime response.
Older compatible runtimes use the existing RPC adapter until their next replacement.
That adapter retains its 1 MiB and 1,024-command limits.
The database and OS process inspection participate in attachment and status observations, outside the per-keystroke path.

## Output

The runtime subscription sends live bytes from a bounded 1 MiB memory buffer.
Ordered asynchronous writes preserve the disk log.
A 256 KiB file queue pauses the process output reader until the file writer drains.
Readers use the disk log when their offset precedes the memory buffer.
Process completion waits for pending file writes before the final exit status.
An abrupt runtime crash can lose queued disk writes; graceful exit drains them.
The provider event journal keeps synchronous writes because it records durable observations.
The host converts each output chunk to a binary WebSocket frame:

| Byte position | Content |
| --- | --- |
| 0–7 | Start byte offset, big-endian Float64 |
| 8–15 | Next byte offset, big-endian Float64 |
| 16 | Retained-buffer gap flag, 0 or 1 |
| 17 onward | Unmodified terminal bytes |

JSON frames carry process observations and errors.
The runtime inspects the process at attachment and on session changes.
Output notifications carry bytes without another process observation.
An exited session sends its final status after retained output, so readers can distinguish completion from a broken connection.
The browser uses `arraybuffer` messages and passes bytes directly to xterm.
The renderer combines output chunks once per animation frame.
A 50 ms timer also flushes pending bytes when the browser pauses animation frames.
Each xterm write contains at most 1 MiB and waits for the previous parse callback.
A full batch can flush while the browser delays animation frames.

The browser requests output flow control with `ack=1`.
After xterm parses each chunk, the browser acknowledges its byte offset.
The host pauses output after 256 KiB of unacknowledged bytes.
Input and resize remain available while output waits.
Older browser clients retain the bounded output behavior without acknowledgments.
The renderer limits outstanding output to 8 MiB.
The host also limits its socket output buffer to 8 MiB.
An overflow closes the connection and exposes the reconnect control.
Accepted renderer bytes remain queued for display.
Reconnect requests the last parsed byte offset and removes overlap with bytes already queued locally.
A retained-buffer gap resets the terminal before the next available bytes.

## Display and lifecycle

The terminal loads the xterm WebGL addon after it opens.
The addon uses a separate dynamic import, so pages without a terminal do not load its code.
GPU failure leaves the DOM renderer available.
Context loss releases the addon and refreshes the terminal.
The glyph cache clears after 32 atlas page additions.
The patched addon caps atlas dimensions at 4096 pixels and releases removed canvas storage.
The exact prerelease pins include the atlas eviction and renderer invalidation that the stable addon lacks.
See the [renderer patch rationale](../patches/README.md).
A registry owns each xterm instance and its subscription independently of React.
The key includes the run, immutable attempt, and provider session identifiers.
Unmount parks the terminal DOM, releases its GPU context, and removes callbacks for that view.
The parser and subscription continue while the instance remains parked.
Remount restores the same terminal buffer and subscription.
Concurrent views use separate instances.
The registry retains at most 12 parked instances for five minutes.
Process exit, connection failure while parked, cache eviction, and page teardown dispose the instance.

The desktop preload resolves a dropped `File` with Electron `webUtils.getPathForFile`.
A writable terminal inserts the escaped paths in drop order, with one space between paths and no Enter.
The terminal uses backslash escapes for shell characters and rejects paths with control characters or line separators.
The drop handler reads no file content and transfers no file.
A browser without the desktop bridge inserts nothing.
Read-only, stopped, detached, and disconnected terminals insert nothing.
Text drags and app drags keep their existing behavior.

The desktop reports the OS accessibility state through its preload bridge.
The terminal enables xterm's screen reader DOM only when that state requires it.
An accessibility change updates the current terminal without a reconnect.
Browsers and older desktop preloads keep screen reader mode enabled because they cannot report that state.

Resize observations use a 75 ms debounce and wait until the parser becomes idle.
The terminal preserves its scroll position after the fit.
Ordinary resizes send only changed row or column counts.
Attachment, reveal, reconnect, and focus force dimensions to the process.

On macOS, Electron disables throttling for covered windows and invalidates the compositor after restore or show.
Electron permits up to 256 active WebGL contexts.
Parked terminals release their own GPU resources independently of that limit.

Wheel input keeps fractional line movement for terminal applications.
SGR mouse mode receives one report per whole line; alternate screens without wheel reports receive cursor sequences.
Ordinary scrollback, Shift selection, legacy mouse encoding, and pixel mouse encoding use xterm's own behavior.
One wheel event sends at most one screen of lines.

The desktop header injector maps WebSocket schemes to the matching HTTP schemes for host authorization.
Navigation keeps its separate origin rule.
A desktop relaunch activates a changed header injector.
The compatible host update leaves the runtime and its agent processes alive.
The accessibility bridge and Electron switches require a desktop relaunch.
The binary channel and memory output buffer take effect at the next runtime replacement.
A compatible host update preserves the existing runtime and uses its negotiated transport.

## Superset investigation

The reference checkout was `superset-sh/superset` at `1019540c0be5069eb5ff3ebb22e5707a42e0999d`.
These modules supplied the design evidence:

| Module | Relevant behavior |
| --- | --- |
| `apps/desktop/src/renderer/lib/terminal/terminal-ws-transport.ts` | Immediate input sends, binary output, replay positions, detached-socket guards |
| `packages/host-service/src/terminal/terminal.ts` | Attached session lookup, direct PTY writes, socket output limit |
| `packages/host-service/src/terminal/DaemonClient/DaemonClient.ts` | Persistent private input channel |
| `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts` | Retained instances, delayed resize, parser coordination, viewport preservation |
| `apps/desktop/src/lib/electron-app/factories/app/setup.ts` | Window throttling and WebGL context limits |
| `apps/desktop/src/main/windows/main.ts` | Compositor refresh after restore or show |
| `apps/desktop/src/renderer/lib/terminal/write-coalescer.ts` | Frame batches and one active xterm parse batch |
| `apps/desktop/src/renderer/lib/terminal/terminal-addons.ts` | WebGL lifecycle, GPU failure, texture growth limit |
| `packages/shared/src/terminal-wheel-handler/terminal-wheel-handler.ts` | Fractional wheel movement, SGR reports per line, alternate-screen cursor input |
| `apps/desktop/src/renderer/lib/terminal/config.ts` | Screen reader mode disabled by default |

Trellis implements these transport and display concepts through its own modules.
Its attempt identifiers and retained output supply the identity and replay boundary.
Its compatible runtime protocol permits deployment while agent processes continue.

Commit `59024289` removed Trellis's WebGL renderer to reduce the asset bundle.
The September 17 comparison found that removal, unconditional screen reader work, and repeated session frames on the output path.
Stock xterm 6.0.0 scales small pixel wheel deltas by 0.3 and emits at most one mouse report per event.
The shared wheel module preserves those deltas and emits the corresponding whole-line reports.
Trellis retains its terminal identity; the change does not alter provider environment variables.

The [Hono WebSocket helper](https://hono.dev/docs/helpers/websocket) requires the Bun server argument and WebSocket handlers.
Header middleware skips upgrade responses because the helper can return immutable headers.
The [xterm addon API](https://xtermjs.org/docs/guides/using-addons/) supplies addon activation and disposal.

## Verification

The September 17 checks used disposable fixtures, xterm 6.1.0-beta.302, and the patched WebGL addon 0.20.0-beta.297.
GPU checks covered activation, context loss, atlas cleanup, failure, and disposal.
Wheel checks covered pixel, line, and page deltas, modifiers, cursor sequences, mouse encodings, and resets.
Runtime checks covered output bursts, status changes, abort cleanup, and exit races.
Actual Unix socket checks covered raw input, resize, live output, retained replay, exit, and slow consumers through the binary channel.
Host checks covered binary and legacy transport selection, parser acknowledgments, and clients without acknowledgment support.
An Aside fixture exercised the shared terminal component with a simulated transport.
Keyboard input, wheel reports, normal scrollback, resize deduplication, reconnect, and live accessibility changes passed.
Forced GPU context loss restored the DOM renderer and preserved keyboard input.
The preload subscription check verified initial state delivery and listener removal.
Native VoiceOver and the installed desktop remain outside these checks.

An Aside browser benchmark used 160 columns, 44 rows, 5,000 retained lines, and a fixed seven-color palette.
Each run wrote 44 lines per frame for 120 frames, then performed 120 scroll steps.
Three paired runs compared xterm 6.0.0 with screen reader mode against the pinned renderer with WebGL and screen reader mode disabled.

| Measurement | Before | After |
| --- | ---: | ---: |
| Median p95 frame time during output | 45.2 ms | 40.5 ms |
| Median p95 frame time during scroll | 40.4 ms | 36.0 ms |
| Median DOM mutations during output | 11,662 | 1 |

These synthetic measurements exclude provider execution and network latency.
Frame pacing stayed near 30 Hz, and timing ranges overlap across runs.
The measurements establish less DOM work, but they do not establish the installed app's input latency or a guaranteed frame-rate improvement.
A 30-frame stress case used a new true-color value for every row and reached 254.6 ms p95 during output.
New glyph colors require fresh rasterization, so this remains a slow workload.
That check confirmed the 4096-pixel limit and continued output after an atlas cache clear.

A synthetic runtime benchmark delivered 10,000 output bursts with actual native process inspection and JSON serialization.
Elapsed time fell from 202.59 ms to 136.97 ms; serialized bytes fell from 4,478,869 to 858,507.
That benchmark measures runtime work, not keyboard latency.

A separate Node runtime and real PTY measured input echo through Unix sockets and disk logs.
Each condition used 150 samples after 20 warmups.
Echo latency at p95 was 2.18 ms when idle and 2.32 ms during 4 KiB of output every 5 ms.
The Node client substituted for the Bun host; browser transport and xterm were outside this measurement.
These measurements describe the initial RPC implementation, before the binary channel change.

The initial renderer checks passed UI, web, runtime, and desktop type checks and changed-file Biome.
The initial web build kept WebGL in a separate 250.74 kB chunk (69.22 kB gzip).
The repository-wide linter reported 13 existing errors outside the changed files.

The binary channel comparison used 150 samples after 20 warmups and a real PTY in a separate Node process.
Both paths used the updated output retention code.
Idle p95 echo latency was 1.487 ms through RPC and 1.231 ms through the binary channel.
With 4 KiB of output every 5 ms, p95 was 1.152 ms through RPC and 0.368 ms through the binary channel.
These measurements exclude the browser and xterm.

The final Aside fixture connected the real shared component to a Bun WebSocket host, a Node runtime, and a native PTY.
A 16 MiB output burst completed without a connection failure.
Keyboard echo, parked output, the same DOM instance after remount, and two concurrent views passed.
Five rapid width changes produced one remote resize.
Remount forced one resize without another socket connection.
After a second view changed the PTY size, focus restored the first view's dimensions before its echoed input.
A live accessibility change preserved the terminal and exposed the final burst marker and echoed input.
Twenty renderer checks passed, including parser completion, replay overlap, cache limits, resize, focus, and cleanup.
All six affected package type checks and changed-file Biome passed.
Web, runtime, and desktop main-process builds passed.
The final repository-wide lint still reports 13 errors and two warnings in unrelated files.
The installed desktop and native VoiceOver remain unverified.
