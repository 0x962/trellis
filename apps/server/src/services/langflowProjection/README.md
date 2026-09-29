# Durable run projection

`getView(ctx, tx, { id })` returns the saved `FlowExecutionViewV1`.
`initialize(ctx, tx, { executionId })` copies the immutable execution metadata into the first view.
Both services use the execution storage from `db/queries/langflowExecution`.
The shared registry selects the engine before it calls this reader.
The shared HTTP router calls that reader through `flowDocuments.view`.

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
An explicit review wait retains its occurrence, action, review area, deadlines, and shared classification digest.
The occurrence stays running with `waitReason: review`; the run exposes `detail: waiting_review`.
The classification receipt can precede engine acceptance, so a pending wait cannot expose a decision.
After acceptance, `acceptedResultId` must equal the stored classification receipt ID.
The engine acceptance record ID does not identify that classification result.
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

## Engine observations

`projectionState` captures the public revision, current authority, and engine cursor before an engine read. `applyEngineObservation` checks these facts again in the transaction that calls `update`. It verifies the original authority, snapshot, and event bytes. The transaction retains the snapshot and cursor with the public view and event.

`createProjectionDomain` exposes `committed` and `recover`. The host supplies the engine client, original authority bytes, worker service calls, and abort signal. Each cursor read gets a new public revision. Recovery pages through retained executions. The host owns its timer and awaits domain work before shutdown.

`readObservation` reads the immutable publication and original occurrence journal. It preserves human feedback predecessors and checks request identity and static specification hashes. Review output requires the stored classification receipt. Native output requires the exact accepted completion receipt. Historical lifecycle fields remain unknown when the journal has no recorded facts.

The graph, group, loop, and occurrence owners supply lifecycle facts. A container checkpoint without its occurrence history returns `projection_container_history_missing`. A request, accepted output, or current loop phase cannot substitute for that history.

`recordWorkspace` records the exact attempt and workspace in the caller transaction. The public attempt reads that observation through `readProjectionFacts`. A null observation preserves an earlier known commit. The workspace query orders these facts by the observed time.
