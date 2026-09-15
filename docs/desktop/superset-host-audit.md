# Superset host audit

## Scope

This audit compares local source on 2026-09-15. It does not certify the installed Superset application.

- Superset: `/Users/navidkhan/projects/superset`, commit `1019540c0be5069eb5ff3ebb22e5707a42e0999d`.
- Trellis: `trellis-readiness-audit`, commit `1a79dbdeabd7650ac9e3306a352161ebbff39dd4`.
- Method: source inspection with `rg`, `sed`, and `git rev-parse HEAD`. The Superset tests below were inspected, not executed.

Superset separates the desktop window, HTTP host, and PTY daemon. This separation lets a host replacement retain the same terminal processes. Trellis uses the same ownership boundary: its Bun host connects to a separate Node runtime.

A terminal service does not establish manager readiness or successful ticket work. Prove the process service first, then the agent receipt contract, then the manager workflow.

## Host acceptance before a manager starts

Use the packaged runtime with a temporary home and deterministic shell fixtures. Do not use a project database, browser, model, or ticket agent for these checks. Record the executable hash, runtime PID, child PIDs, byte offsets, and open descriptor counts.

| Contract | Test | Required evidence |
|---|---|---|
| One owner and one process | Race independent clients against the same runtime home and attempt ID. Repeat with a changed launch payload. | One runtime owner and one child PID. The changed payload fails without another child. |
| Client replacement preserves work | Disconnect every client while a shell emits numbered records. Connect a fresh client at the last consumed offset. | The same child PID continues. The complete byte digest matches, without gaps or duplicate bytes. |
| Slow readers remain bounded | Emit more than 2 MiB, pause one reader, and continue a second reader. Disconnect the slow reader during replay. | The second reader completes. Memory remains bounded by the stream contract. Subscriptions and socket descriptors return to baseline. |
| Repeated lifecycle releases resources | Perform at least 100 start, subscribe, natural-exit, explicit-stop, and reconnect cycles. Read retained output repeatedly. | Open descriptors return to the settled baseline. No child remains. Record RSS separately from descriptor counts. |
| Stop confirms process exit | Start a shell with ordinary children and a child in another process session. Exercise natural leader exit and explicit stop. | A successful response follows exit of every observed owned process. An unconfirmed process produces an explicit error. |
| Runtime loss preserves uncertainty | Kill an isolated runtime while its child lives. Start a successor against the same temporary home. | The successor does not claim terminal control or silently start a replacement. After verified cleanup, status becomes exited. |
| Input receipts remain exact | Drive the authenticated hook API from a deterministic fixture. Race initial receipt, duplicate sends, busy state, and process exit. | Initial readiness needs the initial message receipt. Duplicate IDs do not repeat input. Busy rejection means no bytes were sent. |

Process cleanup has an explicit limit. A descendant can escape its process session and lose its parent before inspection. Tests must state which descendants the runtime observed; they must not imply control of arbitrary detached processes.

## What Superset implements

| Area | Source evidence | Trellis comparison |
|---|---|---|
| Host ownership | `HostServiceCoordinator.startOrAdopt` uses an authenticated health probe, a spawn lock, and a second manifest check. It coalesces concurrent starts. [Coordinator source][coordinator] | `connection.ts` coalesces host calls. `runtimeLock.ts` holds a kernel file lock for the runtime lifetime. The packaged concurrency test must prove both boundaries. |
| PTY ownership | The Node daemon owns PTYs. `handleOpen` rejects a duplicate live ID. `open-ok` reports the child PID after PTY creation. [Handlers][handlers] | `sessionStore.ts` binds an immutable launch fingerprint to an attempt. Same-ID replay must preserve the process; changed parameters must fail. |
| Host and daemon replacement | Host replacement adopts the daemon. A daemon upgrade can transfer PTY master descriptors to a successor. Explicit restart kills sessions. [Supervisor][supervisor], [daemon server][daemon] | Trellis retains the existing runtime during a compatible host update. It has no descriptor-transfer protocol. A runtime replacement cannot recover terminal control from a PID alone. |
| Replay | The actual daemon configuration retains 512 KiB. The host retains a 2 MiB catch-up ring and uses sequence offsets plus an epoch. [Supervisor][supervisor], [terminal service][terminal] | `sessionLog.ts` retains full output on disk. `outputSubscription.ts` sends ordered 64 KiB frames. Tests must verify the entire byte sequence across reconnects. |
| Terminal state | The host sends a terminal-mode preamble. Exact catch-up requires the same epoch and a retained offset. An expired range reanchors the stream and requests repaint. [Terminal service][terminal] | Trellis reconstructs xterm from raw bytes and resumes at byte offsets. Screen fidelity after viewport changes, alternate-screen output, and reconnect needs separate browser evidence. |
| Slow subscribers | The daemon pauses producers above 1 MiB per socket, caps output at 8 MiB, and drops a stalled reader after 30 seconds. The host drops slow renderer sockets above 8 MiB. [Daemon server][daemon], [terminal service][terminal] | Trellis writes output to disk and awaits each socket write. A blocked subscriber times out after 30 seconds. It does not pause the PTY producer. Disk latency and memory require stress tests. |
| Reconnect | The renderer reconnects its socket automatically. A five-second watchdog detects a wall-clock gap above 20 seconds and forces reconnect after sleep. [Renderer transport][transport] | Trellis provides explicit reconnect. Sleep and wake need an acceptance test before any automatic reconnect policy. Input replay must remain separate from output replay. |
| Process status and stop | The host merges daemon sessions with stored terminal rows. On daemon query failure, it can use its in-memory view. `handleClose` acknowledges successful signaling before confirmed process exit. [Terminal service][terminal], [handlers][handlers] | Trellis inspects OS identity before control. `terminateSession.ts` waits for owned process cleanup. Preserve this stronger stop contract. |

Trellis source: [runtime ownership](../../apps/runtime/src/runtimeLock.ts), [process records](../../apps/runtime/src/sessionStore.ts), [socket service](../../apps/runtime/src/server.ts), [output subscription](../../apps/runtime/src/outputSubscription.ts), [disk output](../../apps/runtime/src/sessionLog.ts), [process cleanup](../../apps/runtime/src/terminateSession.ts), and [terminal UI](../../packages/ui/src/terminal/TerminalSurface/TerminalSurface.tsx).

## Agent readiness is a separate contract

Superset's `terminal-agents.getOrCreate` waits for the first lifecycle hook. Its source explicitly distinguishes this from prompt readiness. Concurrent callers share the same launch promise. [Agent router][agents]

Superset serializes follow-up input, applies bracketed paste when supported, and waits 500 ms before Enter. Success means the write completes. It does not prove that the agent accepts the message. Its initial-command path also uses timing, echo checks, and bounded retypes. Daemon adoption estimates replay completion from a quiet interval. [Terminal service][terminal]

These mechanisms do not replace Trellis receipts. Trellis starts the CLI with its initial prompt as an argument. Authenticated hooks acknowledge exact message IDs. `nativeStart.ts` waits for the initial receipt; `communication.ts` rejects busy sends before input. An uncertain receipt remains unknown instead of successful. See [start](../../apps/server/src/services/agentRuns/nativeStart.ts), [send](../../apps/server/src/services/agentRuns/communication.ts), and [delivery records](../../apps/runtime/src/inputLedger.ts).

Superset's event bus broadcasts to connected clients. The inspected code does not establish a durable manager queue, manager heartbeat, or ticket-completion guarantee. [Event bus][events]

## Required work, ranked by observed failure

1. **Packaged child bootstrap and authentication.** TRL-69 exposed a child CLI authentication failure. Commit `411110f0` corrects the bundled CLI path. Prove the installed child resolves that executable and reaches the authenticated host before a manager starts.
2. **Startup and follow-up receipts.** TRL-70 exposed input before the initial prompt receipt. Commits `f510bfac` and `595b0016` add initial receipt checks and controller readiness. Prove delayed initialization and busy rejection with deterministic fixtures, then one real CLI session.
3. **Descriptors, replay, and process cleanup.** The earlier evidence-hash failure exhausted descriptors and broke child starts. Run the packaged lifecycle suite above. Superset has real-descriptor tests for natural exit, explicit close, stale callbacks, normal shutdown, and descriptor transfer. [Descriptor tests][fds]
4. **Terminal reconnect fidelity.** Test alternate-screen applications, bracketed paste, Unicode, a changed viewport, host restart, and laptop sleep. Exact byte replay alone does not prove the reconstructed screen matches the live application.
5. **Long output and storage cost.** Trellis retains full output with synchronous disk appends. Measure sustained output, disk growth, replay latency, and concurrent session responsiveness. Preserve the requested full history; choose storage changes from these measurements.
6. **Runtime upgrades.** Keep the current runtime while it owns active PTYs. Treat descriptor transfer as separate future work. Superset's transfer protocol is not necessary to prove the current host replacement contract.

Do not start TRL-71 until the host acceptance checks pass. Then prove the CLI contract independently. Finally, run the manager against one ticket and require a concrete artifact, exact receipts, and verified process cleanup.

[coordinator]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/apps/desktop/src/main/lib/host-service-coordinator.ts#L733
[handlers]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/pty-daemon/src/handlers/handlers.ts#L46
[supervisor]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/host-service/src/daemon/DaemonSupervisor.ts#L32
[daemon]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/pty-daemon/src/Server/Server.ts#L56
[terminal]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/host-service/src/terminal/terminal.ts#L280
[transport]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/apps/desktop/src/renderer/lib/terminal/terminal-ws-transport.ts#L395
[agents]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/host-service/src/trpc/router/terminal-agents/terminal-agents.ts#L529
[events]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/host-service/src/events/event-bus.ts#L209
[fds]: https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/packages/pty-daemon/test/server-fd-lifecycle.test.ts#L93
