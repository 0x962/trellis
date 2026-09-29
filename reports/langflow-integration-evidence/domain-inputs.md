# Domain inputs for the combined batch

This record names source interfaces and required evidence. It records no executed check.
TRL-696 owns the public routes, internal service registration, shared recovery queue, and shutdown order.
Each source reference identifies inspected bytes; it does not identify a qualified package or complete combined revision.

## Published connections

| Domain | Source | Interface | Required mount |
| --- | --- | --- | --- |
| Start, TRL-1029 | PR940, draft source `b497c591f7` | `services/langflowStart.createStartConnection`, `startState` | Successful public mutation, startup, and serialized recovery |
| Decision, TRL-1028 | PR913, source `59d5abd8a050626777cc986028a75a8951bcceac` | `services/langflowDecisions.decisionConnection`, `decisionState` | `langflowDecisions.state`, postcommit, startup, and serialized recovery |
| Native, TRL-1033 | PR930, source `eb1668fb0165a2eeab3193c52024001ce7fbc3cb` | `createNativeRuntimeWorker`, `nativeRuntimeTransport`, `createNativeRuntimeConnection` | State, observation, recovery, acknowledgment, and projection refresh |
| Stop, TRL-1031 | PR942, source `58155ab149c90cae53b223dfc9faed59152474da` | `services/langflowStops.createStopConnection`, `stopState`, `readCancellationReceipt` | Postcommit, startup, and serialized recovery with actual native stop |

Each connection exposes `committed({executionId})` and `recover()`.
The host must stop and await its recovery work before it closes the transport.
The native connection requires the current supervisor client and the original archived authority bytes.
Its internal ports are `langflowNative.runtimeState`, `runtimeObserve`, `runtimeRecover`, and `runtimeAcknowledge`.
The source references above do not establish complete lifecycle registration or a successful isolated boot.

## Required observations

Start must retain the same host, execution, request, digest, envelope, payload, and original authority bytes across recovery.
Retain the correlation job/session, admission receipt, outbox acknowledgment, and dispatch permit.
A found lookup binds the exact job. An unknown lookup must not submit another job.
A canceled lookup must not submit or open admission.
Confirmation must commit before permit settlement.
The authored HTTP controls remain fixture evidence; actual Python admission and native effects require the composed journey.

Native delivery must retain `engineWaitId`, `waitBytes`, and original `requestBytes` from `/trellis-v1/native/visit`.
PR931, merge `03617930200cb21ec450f64b2f3270d372ab3d0d`, adds the `native_reservation` wait without a fabricated handle.
Include this contract before projection and recovery checks for pending reservations.
The native connection keeps an unresolved reservation pending.
It checks `/trellis-v1/native/lookup` before `/trellis-v1/native/completions`.
Unknown delivery must retain the outbox and permit.
Retain actual runtime inspection, original session, prompt acknowledgment, output, and exact process exit separately.

Stop proof requires both the exact engine cancellation receipt and every outstanding native stop obligation.
PR917 supplies deadline reservation and lookup; PR942 supplies the stop connection.
The combined host must call `recordLaunchClocks` from the persisted launch receipt and schedule warnings and expired stops.
Reservation alone must not start a group deadline.
Retain half/quarter warning receipts, original deadlines, and engine-owned timeout transitions.
The authored stop fixtures use a simulated runtime and cannot establish actual process exit.

Projection still requires the authoritative engine checkpoint reader, lifecycle history, and terminal writers.
A public terminal view or accepted native result alone cannot establish those producers.
The decision and cancellation ordering requirements remain in `batch.md`.

## Conversion and paired snapshots

PR944, source `d148fa819ab48061d94d78e9577ec4816935853a`, exports `services/langflowMigration.createConversionProducer(input, validate)`.
Its compiler consumes actual catalog/template bytes, package identities, and native policies keyed by source node.
`compile({sourceBytes})` and `regenerate` return either blocked diagnostics or a generated expansion.
The domain applies `inspectConversionGraph` and installed validation.
Current catalog diagnostics block every output; no accepted scenario or expected executed output hash follows from this source.
Missing templates, policy authority, grouped review settlement, and scope entry remain explicit producer gaps.
Keep the compiler scenarios separate from actual published documents for the HTTP runner.

The TRL-1044 contract names `capturePairedSnapshot` and the worker ports `readTrellisSnapshotVersion` and `captureTrellisSnapshot`.
Its source publication and production backup mount remain required handoffs.
The contract closes the dispatch gate, exports both stores and matching secrets, seals the files, and retains the host block.
It records the export POST before transport and prohibits automatic POST replay.
`restorePairedSnapshot` targets a fresh home and returns `requires-reconciliation`.
`readPairedSeal` verifies retained bytes; it does not establish a live restored engine.
Workspace and conversation archives remain unavailable references.
Actual authority reconciliation, native process reconciliation, and installed restore remain separate requirements.
