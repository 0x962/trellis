# Paired snapshots

`captureSnapshot(ctx)` seals one prepared directory while `ctx.withQuiescedSnapshot` holds the coordinated snapshot boundary.
The manifest identifies the source host, data home, snapshot, quiesce receipt, package versions, database versions, and secret version.
It inventories every file by relative path, byte count, SHA256, and executable status.
It retains empty directories and explicit unavailable-history records.

The directory contains these roots:

| Root | Required producer content |
| --- | --- |
| `trellis` | Complete `system.snapshot(ctx, tx, {})` output, including PGlite, Pages, attachments, and its manifest |
| `engine` | Consistent engine database export, jobs, checkpoints, and accepted decision/continuation receipts |
| `secrets` | The matching engine encryption secret and its version |
| `workspaces` | Self-contained exports for the retained native workspace identities |
| `conversations` | Available provider conversation exports with their original identities |

PGlite retains publications, completion receipts, decision receipts, stop obligations, ticket/diff links, and review records together.
The manifest does not replace any database record or rewrite identity bytes.
`unavailable` names historical content that the source cannot export and states its reason.
An empty root does not prove complete export coverage.

## Coordinated boundary

The trusted `withQuiescedSnapshot` implementation closes new admission and stops engine writes before it takes either store snapshot.
It drains in-flight callbacks, decisions, completions, and native launch reservations into their durable receipts.
It exports the matching secrets and native files while their writers remain excluded.
It calls the consumer once with private, immutable export files and the durable boundary receipt identifier.
It retains the barrier until the consumer finishes.
A failed export does not call the consumer.
The caller owns barrier cleanup and incomplete export retention.

`system.snapshot` supplies only the Trellis store.
`SidecarDriver` supplies `start`, `observe`, and `stop`; it supplies no engine snapshot transport.
The `engineSnapshot` module supplies the authenticated SQLite export client.
Its independent Langflow backup fragment supplies the configured engine export and router.
`capturePairedSnapshot` composes the host gate, capture grant, exports, and seal.
TRL-696 owns producer registration and the public system procedure.
Unknown ownership blocks effect admission but does not prevent a quiesced export of retained bytes.

## Isolated restore

`restoreSnapshot(ctx, { snapshot, destination, compatibility })` requires a new destination directory.
It compares every compatibility field exactly before it creates that directory.
It refuses an existing destination, including an active data home.
It never replaces, renames, or deletes a source or active home.
Later ticket and review writes therefore remain in that home.
Activation requires a separate preservation plan for those later records.

Before it copies data, the reader writes and syncs `restore-recovery.json` and awaits `ctx.blockDispatch`.
The trusted `blockDispatch` implementation persists its block outside the restored database before it returns.
Admission, startup recovery, engine delivery, native dispatch, and decision dispatch must all consult that block.
The marker alone does not enforce those paths.
`assertRestoreReconciled(directory)` rejects a retained marker and propagates unreadable-file errors.
It is a composition hook, not an automatic host startup hook.

The reader copies into `payload.partial`, verifies the copied inventory, and renames that directory to `payload`.
A failure retains the recovery marker and the partial copy for inspection.
The result remains `requires-reconciliation` after a successful copy.
No method in this module grants execution authority or removes the block.
The recovery owner must reconcile old owners, exact attempts, stop obligations, and immutable job bindings before any dispatch.
Unknown ownership keeps the block active.
Copied secrets and ownership records are historical data; they do not authorize a new engine instance.

All destination directories use mode 0700.
Files use mode 0600, or 0700 when their original executable bit is set.
The reader rejects links, special files, extra files, missing files, content changes, and manifest path changes.
Exports must remain immutable in an owner-only directory during inspection and copy.
Workspace exporters must preserve Git metadata as self-contained data, not links into an active checkout.

## Verification boundaries

The restore fixtures exercise real PGlite receipt exports and a synthetic SQLite job store.
The SQLite fixture does not run Langflow or prove its checkpoint export protocol.
The injected fixture gate proves the restore call order and retained block only.
Actual engine snapshot transport, integrated host enforcement, process reconciliation, and installed ENG-F16 acceptance remain integration requirements.
No production restore, provider call, or conversation reset forms part of these fixtures.

## Paired domain entrypoints

`capturePairedSnapshot(context, input)` accepts a snapshot UUID, request ID, new export directory, and abort signal.
Its context holds capture-only host control, a held supervisor, capture authority, an authentication file, and two database worker ports.
The worker ports call `readTrellisSnapshotVersion` and `captureTrellisAndSeal` through `ServiceTransport`.
TRL-696 owns the prepared mutation and the public system procedure.
The caller constructs capture authority inside `withHeldEngine` and passes that held supervisor to the paired adapter.

`readTrellisSnapshotVersion(ctx, tx)` returns the installed Trellis version and a SHA256 of the ordered migration records.
`captureTrellisAndSeal(ctx, input)` requires the system actor and the exact closed, drained host block with an active capture grant.
It runs outside the transport's automatic transaction.
First it reads current runs, session directories, and retained native attempts in a short transaction.
Then it reads original launch identities and acquires one runtime batch scope outside every database transaction.
Launch uses the same runtime scopes before it opens a transaction, so the opposite order can deadlock.

Within the runtime scope, one transaction revalidates the original records and launch identities.
It exports every selected workspace and provider conversation through producer-owned root IDs.
`captureTrellisSnapshot` then exports private launch files, canonical stop and database facts, and the complete `system.snapshot` output.
This preserves ticket, review, Page, and attachment records in the same Trellis snapshot.
The callback syncs and places that snapshot, appends exact unavailable history, and seals the aggregate before the runtime scope ends.
The result supplies the manifest, its original bytes and digest, and the Trellis export result.
No callback crosses the worker transport.

Workspace archives appear below `workspaces/archives/`; conversation archives appear below `conversations/archives/`.
Their indexes retain original identities and actual component manifest and seal receipts.
Missing launch metadata, provider history, and session-loss facts remain unavailable.
A runtime refusal aborts capture and leaves the host gate closed.
The standalone `captureTrellisSnapshot` entry keeps unavailable records when it has no held history export.

The capture sequence closes the host gate, drains durable permits, and commits the exact capture grant to the engine.
The grant excludes engine writers through both exports and the manifest seal.
The adapter then revokes the grant and returns `requires-reconciliation` with the host gate closed.
Errors retain the current grant, block, journal, and partial exports.
The supervisor checks the exact engine instance before export.
The host control stores the immutable operation journal under its external `paired-snapshots/<snapshotId>` directory.
The journal records an export attempt before the snapshot POST.

`readPairedRecovery` reads that journal, current permits, and current capture grants without a network mutation.
`finishPairedCapture` verifies a complete seal and recovers revocation with the same grant bytes.
It never sends another export POST and never releases the host gate.
An incomplete or unavailable seal keeps capture recovery blocked.

`restorePairedSnapshot` accepts a source snapshot, new envelope, new target home, request ID, compatibility, and abort signal.
Its context provides the current live home.
The target home, source, live home, and envelope must remain separate.
After the restore marker exists, it creates external host control with the exact restore block before it copies payload files.
`LangflowHostControl.initialize` creates this block with an empty permit store.
The host later opens that control with its actual evidence producer.
The target home remains empty; the verified payload stays under the envelope.
A separate owner must install those bytes and verify the live engine before release.
The source and all later live records remain intact.

`readPairedSeal` verifies the stored inventory and exact engine binding, database file, encryption secret, and version receipts.
It returns retained source bytes and their digests for the manifest, engine receipt, native inventory, stop records, and canonical Trellis facts.
Captured stop records name the source block; current restore reconciliation must query facts for the target block.
These retained bytes do not identify the database currently open in a live engine.
TRL-676 owns the actual current-store verifier, authority and attempt reconciliation, and final gate release.
TRL-1058 supplies the durable engine lease for live reads across that release.
The restore marker remains until that complete producer proves the exact restored state.

## Retained work and cleanup

Each operation owns its new export directory, journal, and any staging path recorded in its Trellis stage.
Each restore owns its new target home, external control, envelope, and partial payload.
A failure keeps these paths for inspection and explicit recovery.
Cleanup must first settle capture revocation and preserve the operation evidence.
This module does not delete source snapshots, live homes, unknown workspaces, or provider conversations.
The integrated runner must supply these exact paths to its cleanup owner.

## Canonical database facts

The capture worker calls `readReconciliationFacts(tx)` before `system.snapshot` in the same transaction.
It saves the result in `workspaces/trellis-database-facts.json` with mode 0600 and syncs the file before the seal.
The result holds `migrations` and `facts`, each with an exact `sourceBytes` string and its UTF-8 SHA256 in `sourceDigest`.
The storage query owns the canonical representation of the rows and retained native associations.
The backup code stores these strings without parsing or reserializing their contents.
The migration digest must match `SnapshotCompatibility.trellisDatabaseVersion`.

`readPairedSeal` validates the facts file through the complete snapshot inventory and `ReconciliationFactsSchema`.
It checks each string digest and the migration binding.
It exposes the original result as `trellisFacts` and the exact outer file bytes as `sources.trellisDatabase`.
A snapshot without this file fails with `paired_trellis_facts_unavailable` for reconciliation.
Its physical files remain readable through `readSnapshot`.
The live worker must compare these facts under the required exclusion before release.
The presence of this file does not prove current destination state or complete workspace and conversation exports.

## Paired archive

`archivePairedSnapshot({directory,manifestDigest,path})` returns the existing `BackupOutput` shape, `{path,bytes}`.
The caller supplies the digest from the completed capture result or its verified recovery record.
The producer verifies the source, copies the manifest entries to a private stage, and verifies the copied bytes.
It archives `paired-backup.json` and all five component roots at the archive root.
The manifest bytes remain exact, including unavailable history.
The archive preserves executable files and uses mode 0600 for its output.
Publication refuses an existing destination or a path inside the source envelope.

The producer removes only its temporary stage and retains the original capture envelope and recovery journal.
It does not prune older archives or grant dispatch authority.
The host must await the producer before it releases the supervisor and transport.
The paired archive needs a paired extraction reader; the legacy restore layout is incompatible.
Synthetic fixtures cover archive extraction, manifest identity, component bytes, private mode, corruption, and destination refusal.
These fixtures do not establish live capture or restore acceptance.
