# Human decisions

`createReceipt` checks the human actor, public revision, exact action, and pending occurrence.
It retains the original `HumanWaitV1` from the engine checkpoint.
The engine compares this complete wait with its saved wait before acceptance.
A later public revision must not rewrite the original wait.
The receipt retains the full notes in `output` and the Boolean `approved` value.
A negative value represents human feedback.

`record(ctx, tx, input)` locks the execution and reads the saved projection and checkpoint.
It stores the receipt, outbox, and next public revision in the caller transaction.
A concurrent decision observes that revision or the existing receipt.

`deliver` calls the engine outside the database transaction.
Its input contains the stored receipt bytes, digest, and current delivery authority.
`prepareDelivery` checks system authority and commits the pending state before this call.
An authoritative absent lookup permits delivery of the exact bytes.
An accepted lookup must identify the exact decision, request, job, execution, and digest.
An explicit receipt conflict throws `decision_acceptance_conflict`.
A transport error returns an unknown state.
The required logger records the failed operation, receipt identity, and a safe error category.
A malformed acknowledgement throws and leaves the durable pending receipt for recovery.
`recordAcknowledgement` saves confirmation and the outbox receipt in the caller transaction.
`deliverDecision` commits preparation, calls the engine, then commits the acknowledgement.
A subsequent recovery uses the same stored decision and bytes.

`DecisionEngine.lookup` requires the result from `DecisionAcceptanceLedger.lookup` in TRL-670.
`DecisionEngine.accept` requires the result from `BackgroundExecutionService.accept_trellis_human_decision`.
The transport must preserve UTF-8 bytes and enforce current authority at the engine boundary.

## Required integration

TRL-683 owns the receipt and outbox tables.
TRL-689 owns the saved projection and engine checkpoint.
`commitProjection` stores the original checkpoint with the public view.
`record` reads that checkpoint through `readCheckpoint` under the execution lock.
The engine compares the original wait across a restart.
TRL-696 owns the engine transport, route composition, and recovery worker.
Its human handler calls `record` with the existing public decision fields.
Its worker enumerates decision items through `listPendingDeliveries` and calls `deliverDecision`.
The handler returns a versioned view.
The legacy decision endpoint retains its strict legacy response contract.

## Verification

Run the focused fixtures after the merged source batch:

```sh
bun test apps/server/src/services/langflowDecisions --timeout 30000
bun run --cwd apps/server typecheck
./node_modules/.bin/biome check apps/server/src/services/langflowDecisions
```

The fixtures cover concurrent humans, transaction rollback, receipt validation, and acknowledgement responses.
They also cover a failure before the acknowledgement commit and recovery through the saved acceptance.
Actual process termination, engine continuation, and installed-host behavior require integrated proof for ENG-F20.
