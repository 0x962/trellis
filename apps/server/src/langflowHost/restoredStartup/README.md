# Initial startup after an engine restore

`readRestoredEngineStartup({home, receiptId, qualification, homeLock, signal})` reads the installed receipt and current restore block. Pass the real home lock from the application entrypoint. Pass the result as `restoredStartup` to `LangflowSupervisor.open`.

The reader returns `undefined` when the actual control has no restore block and the configured receipt is null. A restore block requires the configured receipt. The supervisor checks this requirement again before it reserves a process. An application with no Langflow configuration does not call this reader.

`assertHomeLock` recognizes only active handles from `lockHome` for the same canonical directory. `withHomeLock` borrows such a handle. The owner cannot release it while the awaited operation has a borrow.

The supervisor holds its lock and calls the OCI driver's `withRestoredStart` method before process reservation. The driver reads the actual destination with its own command runner, image config, and private root. It validates the qualification, install receipt, capture, volume labels, file hashes, and modes. It holds the dispatch lock through process reservation, credential writes, engine start, health confirmation, and the initial receipt.

The verified scope is private to one awaited startup. The driver refuses a forged, expired, or mismatched scope. Restored provisioning checks the captured secret before and after credential writes. A missing or changed secret fails; this path cannot generate a secret.

The external restored-engine store binds `initial-start-intent` before process reservation. It binds `initial-start` only after health confirms the same instance. The first record contains `beforeStart` evidence and the installation receipt ID. Later engine writes cannot update that evidence. A failed or unknown attempt keeps its intent and closed dispatch block. It needs separate reconciliation before another initial attempt.

The caller retains the home lock for the application lifetime. The supervisor retains its lock until shutdown. The startup scope releases its borrow and dispatch lock after the awaited operation finishes. It never releases dispatch authority. Live reconciliation and other restored components remain separate.

The shared fixture exports `restoredStartupFixture` from `fixtures/restoredStartupFixture`. It uses real temporary files, a sealed snapshot, the paired journal, actual installation receipts, and the copy helper. Its injected OCI runner models named volumes and maps container ownership to the fixture OS user. It cannot prove actual OCI ownership, startup, or compatibility. All authored fixtures and runtime checks remain unexecuted under the release hold.
