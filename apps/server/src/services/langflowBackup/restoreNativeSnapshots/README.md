# Native snapshots in an isolated restore

`restoreNativeSnapshots({home,hostId,dataHomeId,block,signal})` installs captured launch snapshots in the isolated target home.
Call it outside a database transaction and before the target server starts.
It holds `withIsolatedRestore` across the installation.
That scope holds the home, supervisor, and dispatch locks.
One `withRuntimeMutationExclusion` holds attempt retention and the sorted exact attempts inside the restore scope.

The service reads the actual paired journal, restored stage, and verified paired seal.
The captured database facts must bind every native inventory entry.
Each available entry identifies the execution, step, run, attempt, request digest, and original snapshot digest.
The source path is `payload/workspaces/native-launches/<attemptId>.json`.
The destination is `home/harness-attempts/<attemptId>/langflow-launch.json`.
The inventory's `sourcePath` remains provenance and never selects a destination.

An immutable intent binds the target identity, exact restore block, original manifest bytes, original inventory bytes, and captured facts digest.
The service persists the intent before the first snapshot copy.
It uses `writeLaunchSnapshot` for absent files and verifies every destination with `readLaunchSnapshot`.
Equal replay preserves the original bytes.
A conflict leaves existing files intact.
A partial installation retains its intent and verified files for a later exact replay.

The returned `{receiptId,sourceBytes,sourceDigest,record}` describes the installed files.
Each destination includes its absolute path, digest, byte count, mode, owner UID, and group GID.
The record preserves captured identities separately from the target identity.
Historical and missing snapshots remain in `unavailable`; `complete` refers only to available native snapshot files and their inventory.
The record always has `state: "requires-reconciliation"`.
Private launch bodies and tokens stay in the snapshot files.

`readRestoredNativeSnapshots({home,receiptId,block,signal})` verifies the immutable intent, receipt, original source, and current destination files.
The caller must hold the actual native and dispatch exclusion across this read and its use of the result.
It acquires no home lock, so a running verifier can use its existing held scope.
The offline installer must not wrap a running verifier.
File evidence does not establish native process ownership, provider conversation recovery, workspace recovery, or permission to open dispatch.

The fixture source uses real paired journals, file helpers, and exclusion scopes with synthetic bytes.
All execution checks remain deferred to the coordinated batch.
