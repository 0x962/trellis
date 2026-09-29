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
TRL-696 owns producer registration and the barrier composition.
The injected boundary is a required interface, not a supplied production adapter.
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
