# Engine snapshot producer

The fragment adds `langflow.services.trellis_v1.backup` and `backup_router` to the pinned Langflow source.
`source/` contains the exact Python files in the patch.
TRL-674 places this independent fragment after the backend and schema fragments in the package series.

`create_backup_router` receives the configured `DatabaseService`, `SettingsService`, private export root, authentication file, installed package digest, source home, and host.
The router serves `POST /trellis-v1/snapshots` and `GET /trellis-v1/snapshots/{snapshotId}/{database|secret}`.
Every operation requires the private bearer token.
The export root uses mode 0700; each export file uses mode 0600.
Snapshot IDs select new directories and cannot overwrite an earlier export.
The owner retains failed exports for inspection and controls their cleanup.

The POST body binds the snapshot UUID, source home, source host, durable boundary receipt, and all paired compatibility fields.
The engine compares its installed identity and actual secret digest with the request.
It obtains the active SQLite connection from `DatabaseService.engine` and uses the SQLite online backup API.
The export includes every table and committed WAL content.
It checks SQLite integrity, required job tables, and actual Alembic revisions before it saves the receipt.
The receipt identifies both exported files by SHA256 and size, and retains the complete request binding and table inventory.
`secretVersion` is the SHA256 of the active UTF-8 encryption secret.
`engineDatabaseVersion` joins the sorted Alembic revision IDs with commas.
PostgreSQL requires a separate producer; this exporter rejects it.

The service `capture_engine_snapshot` requires `snapshot_boundary(binding)` to validate the durable grant and hold engine writers closed during export.
The context exit keeps the outer host block closed.
Only reconciliation with the completed seal receipt can reopen that block.
The trusted host holds the same coordinated pause across this operation, the Trellis snapshot, all native exports, and manifest completion.
A request field cannot grant that pause.
TRL-849 supplies durable host exclusion; TRL-696 supplies its composition and router registration.
The producer does not release the outer pause, start jobs, or activate restored data.

`exportEngineSnapshot` in `services/langflowBackup/engineSnapshot` calls this protocol through the authenticated loopback endpoint.
It streams both files into the prepared `engine` and `secrets` roots, verifies the receipt and content, then syncs the files and directories.
A failed download retains partial files and does not write a completed receipt.
The caller holds the coordinated pause until `captureSnapshot` finishes its manifest.
Native workspace and conversation exports remain separate required producers.

The Python fixture creates a real suspended job, checkpoint, and correlation receipt with Langflow services.
It exports through the router, reopens the copy, and checks the original identity and checkpoint.
It also checks that a later checkpoint write remains in the source database.
Its pause fixture verifies the callback contract; integrated effect exclusion and restored ownership remain separate proof requirements.
TRL-667 owns candidate patch application and the matched batch command.

```sh
TRELLIS_ROOT=/path/to/trellis LANGFLOW_SOURCE_ROOT=/path/to/candidate/source \
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/path/to/candidate/source/src/backend:/path/to/candidate/source/src/backend/base:/path/to/candidate/source/src/lfx/src \
/path/to/candidate/venv/bin/python -m pytest -q -c /path/to/candidate/source/pyproject.toml \
-p tests.conftest /path/to/trellis/integrations/langflow/tests/restore/test_engine_snapshot.py
```

Use a private `LANGFLOW_CONFIG_DIR`, HOME, and TMPDIR with the candidate command.
Keep `LANGFLOW_TEST_DATABASE_URI` empty for the isolated SQLite fixture.
