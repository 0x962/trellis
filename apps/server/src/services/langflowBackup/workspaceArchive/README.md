# Workspace archives

`exportWorkspaceArchive({capture}, {binding,destination})` consumes a producer-owned read API.
`WorkspaceCaptureReader` is a consumer requirement, not an implementation of OS exclusion.
Without that producer, the function returns `consistency_unavailable` before it creates files.
The producer must reject expired or changed capture identities on every list and read.
The outer caller must retain the actual scope through every export and the aggregate snapshot seal.
The exporter does not release that scope.

`binding` identifies the capture, snapshot, host, data home, dispatch block, generation, workspace, and exact run/attempt associations.
The `worktree`, `git`, and `common` roots are logical selectors into the held capture.
The API never accepts a caller path as a source of consistent bytes.
TRL-1074 owns the concrete runtime producer and its proof of exclusion.
The current paired capture continues to report workspaces unavailable until that producer and composition exist.

The producer supplies complete root inventories, including ignored and untracked files.
It excludes the top-level worktree `.git` marker because the separate Git roots preserve that association.
`git` names private worktree metadata; `common` names the shared object store and references.
A standalone repository can supply the same original directory for both roots.
The inventory records original directory identities and the object format.
The producer must close every repository dependency before it supplies these roots.
Alternates, promisor packs, embedded repositories, and submodule stores currently fail explicitly.
The common `worktrees` registry can be omitted because the private `git` root supplies the selected workspace metadata.

`workspace.json` binds entries to numbered objects with SHA256 digests and byte sizes.
Regular files retain their modes. Directory records preserve empty directories and modes.
Symbolic links retain their text but must resolve within the captured worktree.
Links inside Git metadata, escaping links, cycles, duplicate paths, and children of a non-directory fail.
The exporter syncs every object before it publishes the manifest.
Repeated inventory reads detect a changed contract response; they do not prove filesystem consistency.

`restoreWorkspaceArchive({liveHome}, {archive,sourceDigest,destination})` verifies the supplied manifest digest and all object bytes.
The caller obtains `sourceDigest` from the sealed paired snapshot, not from an untrusted restore request.
The destination must be absent and outside the live home, archive, and original workspace.
It receives a `worktree` and a complete retained `archive` with independent file copies.
The returned binding preserves original workspace and run identities; the restore does not rewrite database associations.

Git restore combines common metadata with private worktree metadata into `worktree/.git`.
It excludes source `gitdir`, `commondir`, hooks, and the registry of other worktrees from that active directory.
It writes a local configuration with the captured object format, file modes, and `bare=false`.
The retained archive preserves the original configuration, remote references, and administrative bytes.
The restore invokes no Git hooks, provider, or network command.
It does not install the workspace into a live data home or release dispatch.
Failures retain their own incomplete destination for inspection; an existing destination is never overwritten.

`integrations/langflow/tests/restore/workspaceArchive.test.ts` authors synthetic filesystem and repository cases.
The fixture reader supplies synthetic data and does not implement OS exclusion.
Runtime exclusion, concurrent external writers, installed capture, and aggregate restore remain separate proof requirements.
