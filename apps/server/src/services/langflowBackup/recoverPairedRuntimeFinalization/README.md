# Recover runtime finalization

`recoverPairedRuntimeFinalization(ctx, { snapshotId })` requires a system actor and the current data home. It uses `nativeClient(home)` and the external paired journal.

The result contains `snapshotId`, `captureId`, `state`, and `finalization`. The state is `unknown`, `committed`, or `abandoned`. An unknown result contains `finalization: null`. Other results retain the original runtime receipt and its exact `receiptBytes` string.

The operation reads the saved `runtime-request` and checks its snapshot, host, home, block, and generation. The current dispatch block must match the saved capture block. `readCaptureFinalization(request)` supplies the saved runtime outcome. The domain validates the request digest and original receipt bytes before it calls `finalizeCapture` with that saved outcome. This call clears a residual runtime hold after a lost reply. Its acknowledgement must contain the same receipt bytes.

After that acknowledgement, the journal retains `runtime-finalized`. A lost acknowledgement leaves recovery incomplete. A later call reads the same runtime receipt and repeats the proven outcome. A missing receipt returns `unknown` and leaves the hold unresolved. An abandoned receipt remains abandoned. `finishPairedCapture` requires a committed receipt and retains its separate seal and grant checks.

The composition owner can expose this serializable operation through one prepared worker action. The domain awaits the runtime reply before the worker returns. Engine grant revocation and dispatch reconciliation remain separate operations. Snapshot files and seal records do not establish a transaction outcome.

`integrations/langflow/tests/restore/runtimeRecovery.test.ts` contains synthetic cases for receipt recovery and refusal. These fixtures do not establish runtime crash recovery or installed acceptance.
