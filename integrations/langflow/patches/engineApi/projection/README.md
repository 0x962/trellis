# Durable projection checkpoints

`projection_store.record_projection_checkpoint(session, job_id)` retains each changed graph and occurrence journal in the existing `JobCheckpoint` table. The caller holds the graph lock, then the Job row lock. The caller saves its authoritative facts, calls the helper, and commits the same transaction. The caller supplies the authorization for that mutation.

The helper locks the authority row after the Job row. Both locks remain held until the caller commits. It reads flushed rows and preserves their original strings. It allocates one per-job sequence and one source event identity for changed bytes. An equal snapshot returns the original record. The helper also validates retained review results against the acceptance ledger.

`trellis-projection-latest-v1` holds the latest record. `trellis-projection-snapshot-v1:<sequence>` retains each original snapshot and source event. The snapshot envelope uses that sequence as its checkpoint revision. Its continuation reference names the stored graph row. The captured time describes the snapshot, not a native launch or vertex completion.

`trellis-projection-outcome-v1` holds the job owner's explicit outcome bytes. The job owner must save this row in the same transaction as a terminal transition. The host must reject a terminal observation without the required authoritative outcome.

`projection_reader.read_projection_checkpoint` returns one retained record after a cursor. Repeated calls reach all records. A cursor gap or an old epoch returns the latest snapshot with an explicit `gap` state. An epoch without a current snapshot returns `unavailable`. A new owner must save a checkpoint with its authority before the host can reconcile that epoch.

`projection_router.create_projection_router` supplies `POST /projection/read` beneath the private `/trellis-v1` root. The router requires transport authentication, current authority, and the exact capability header. It reads the snapshot under the Job lock. The root startup module owns the mount.

Native and human writers retain their explicit `projection` facts in the occurrence journal. A request or result receipt alone cannot prove vertex completion. The graph, group, loop, and terminal owners must call the helper after their authoritative saves. The host projection service owns public revision checks and retained native result validation.

The fragment has authored tests. Execution, lint, composition, and runtime proof remain deferred to the full batch.
