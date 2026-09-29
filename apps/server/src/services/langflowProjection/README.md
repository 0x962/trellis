# Durable run projection

`getView(ctx, tx, { id })` returns the saved `FlowExecutionViewV1`.
`initialize(ctx, tx, { executionId })` copies the immutable execution metadata into the first view.
Both services use the execution storage from `db/queries/langflowExecution`.
The shared registry selects the engine before it calls this reader.
`createFlowExecutionViewV1` accepts that shared reader for the versioned HTTP procedure.

`update` requires the system actor, current delivery authority, and an authoritative engine observation.
The private transport authenticates the sender before it creates this system context.
The serialized capability identifier alone gives no authority.

The caller reads the view revision before it fetches the engine snapshot.
It supplies that revision as `observation.expectedRevision`.
The caller obtains occurrence metadata and `reviewArea` from the immutable publication.
It obtains occurrence state, accepted result references, and the checkpoint from the engine.
The observation includes the complete occurrence history.
A later transaction rejects a revision conflict and requires a fresh snapshot.

`acceptedResultId` names the native completion, human decision, or Jev classification receipt.
The engine observation supplies no output bytes or native receipts.
The service reads those records from storage within the same transaction.
Native success requires the exact accepted completion and result digest.
Human success requires the exact confirmed decision.
A Jev gate uses the saved classification for the execution, publication, diff, and review target.
Groups and loops retain the engine state; this service selects no successor or round.

`sourceBytes` holds the original `SourceEventV1` bytes, or null for snapshot reconciliation.
The execution lock covers source deduplication, authority checks, receipt reads, and the projection write.
Equal source bytes return the original event, including after an ownership change or cursor expiry.
Changed bytes conflict.
New events require the current epoch and receive the next Trellis sequence.
Event storage and the view update commit together.
Snapshot reconciliation advances the view revision and retains the event sequence.
The transaction emits `flows.changed` after its commit through the existing event collector.

`replay` returns contiguous milestones or an explicit gap.
After a gap, the client fetches `getView` and resumes from `lastEventSeq`.
The storage owner retains permanent event identities.
Retention policy belongs to TRL-674; this module runs no retention timer.
Token output uses the native output transport.
The state journal accepts only the strict milestone contract.
The view retains complete saved result output and exact output references.

The fixtures cover the projection and transaction boundaries.
Run the focused suite after the merged batch:

```sh
bun test --config apps/server/src/langflowContracts/fixtures/bunfig.toml apps/server/src/services/langflowProjection
bun run --cwd apps/server typecheck
```

The in-memory database fixture uses the declared tables and constraints.
Production migrations, private transport authentication, engine snapshot adaptation, and mounted client behavior require integration proof.
ENG-F3, ENG-F5, and ENG-F12 require that combined proof.
ENG-F18 requires the frontend owner's Aside render checks.
