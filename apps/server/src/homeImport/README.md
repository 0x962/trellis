# Offline home import

`entry.ts` provides an offline maintenance command for the CLI and desktop app. It prints one JSON result on stdout. A failure exits with a nonzero code and prints its reason on stderr.

The source host and runtime must be stopped. The target must be an empty directory or an unused path with an existing parent. The source and target must be separate, non-nested directories.

```sh
bun apps/server/src/homeImport/entry.ts preview --source /path/to/source --target /path/to/target
bun apps/server/src/homeImport/entry.ts import --source /path/to/source --target /path/to/target --expected-version VERSION_FROM_PREVIEW
bun apps/server/src/homeImport/entry.ts rollback --target /path/to/target --archive /path/to/target-archive
```

The CLI exposes the same operations through `trellis home-import`. The desktop app uses its bundled Bun executable and this entry path. `types.ts` defines the JSON results.

The preview includes file counts, byte counts, project counts, workspace references, and blockers. Import refuses active agent records, unresolved deliveries, unfinished flows, unresolved checks, and runtime process records that need reconciliation. Unassigned pending manager events remain queued.

The helper holds the source ownership locks through read-only file descriptors. It opens only a copy of the database. It verifies copied file hashes and checks the source again before it prepares the database.

The copy includes attachments, conversation history, agent files, runtime output, and evidence. It excludes sockets, ownership files, desktop connection tokens, and packaged releases. It preserves internal relative workspace links. It converts external relative workspace links to their original absolute references.

Workspace references in the database keep their original paths. The helper does not relocate Git worktrees. The original folders must remain available to inspect that work.

The copied database has legacy automation disabled and native work paused. Every project has dispatch paused and repository trust cleared. Other project settings stay in place. `import-provenance.json` records the source version, configuration hashes, prior pause settings, and workspace references.

The server calls `assertHomeImportReady(home)` after it acquires the home lock and before it opens the database. An `import-in-progress.json` marker prevents a partial copy from booting. The helper retains this marker and copied files after a failure.

Rollback requires an offline target and an unused sibling archive path. It moves the entire target, including new files and evidence, into that archive. It preserves the source. An interrupted copy can be archived even if its initial marker is incomplete.
