# Human decisions

`createReceipt` checks the human actor, public revision, exact action, and pending occurrence.
It retains the original `HumanWaitV1` from the engine checkpoint.
The engine compares this complete wait with its saved wait before acceptance.
A later public revision must not rewrite the original wait.
The receipt retains the full notes in `output` and the Boolean `approved` value.
A negative value represents human feedback.

The caller must lock the execution before it reads the projection and checkpoint.
It must store the receipt, outbox, and next public revision in one transaction.
A concurrent decision must observe that revision or the existing receipt.

`deliver` calls the engine outside the database transaction.
Its input contains the stored receipt bytes, digest, and current delivery authority.
The caller must commit the pending state before this call.
An authoritative absent lookup permits delivery of the exact bytes.
An accepted lookup must identify the exact decision, request, job, execution, and digest.
A conflict or transport error returns an unknown state.
A malformed acknowledgement throws and leaves the durable pending receipt for recovery.
The caller must save confirmation and the outbox receipt together.
A subsequent recovery uses the same stored decision and bytes.

`DecisionEngine.lookup` requires the result from `DecisionAcceptanceLedger.lookup` in TRL-670.
`DecisionEngine.accept` requires the result from `BackgroundExecutionService.accept_trellis_human_decision`.
The transport must preserve UTF-8 bytes and enforce current authority at the engine boundary.

## Required integration

TRL-683 owns the receipt and outbox tables.
TRL-689 owns the saved projection and engine checkpoint.
The checkpoint must retain the exact pending `HumanWaitV1` across a restart.
The public view omits fields that the engine requires for exact acceptance.
A public view alone cannot reconstruct that wait.
TRL-696 owns the engine transport, route composition, and recovery worker.

## Verification

Run the focused fixtures after the merged source batch:

```sh
bun test apps/server/src/services/langflowDecisions
bun run --cwd apps/server typecheck
./node_modules/.bin/biome check apps/server/src/services/langflowDecisions
```

The fixtures cover receipt validation and acknowledgement responses.
Database concurrency, transaction rollback, process crashes, and engine continuation require integrated proof for ENG-F20.
