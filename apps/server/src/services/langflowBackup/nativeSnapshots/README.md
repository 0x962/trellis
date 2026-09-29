# Native launch snapshots

`exportNativeSnapshots(ctx, tx, {directory})` consumes the native service manifest under the coordinated pause.
The native producer supplies exact reservation identities and verifies each private launch file against its durable digest.
The exporter reads those exact bytes again, writes private files under `workspaces/native-launches`, and syncs their inventory.
The inventory retains source references and reservation identities with each destination path.
The source file and provider conversation remain unchanged.

The caller appends the returned `unavailable` entries to `SnapshotMetadata.unavailable` before it seals the paired snapshot.
The inventory retains all unavailable reservation identities from the producer.
A missing historical digest, missing file, or corrupt file keeps the native manifest unready.
A source change during export stops capture before a paired manifest can complete.

Restore retains the inventory and exact files as private data.
It keeps dispatch blocked until the recovery owner reconciles the files with their retained reservation digests and identities.
Unavailable launch data cannot authorize a new native attempt.
Core composition owns that reconciliation and the mapping from exported files into an isolated target home.
