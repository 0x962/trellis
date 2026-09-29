# Engine snapshot producer

The fragment adds the snapshot producer and capture authority modules under `langflow.services.trellis_v1`.
`source/` contains the exact Python files in the patch.
TRL-674 places this independent fragment after the backend and schema fragments in the package series.

`create_backup_router` receives the configured `DatabaseService`, `SettingsService`, private export root, authentication file, installed package digest, source home, and host.
The router serves `POST /trellis-v1/snapshots` and `GET /trellis-v1/snapshots/{snapshotId}/{database|secret}`.
The domain router uses `/snapshots` beneath the common `/trellis-v1` router.
TRL-875 owns that common router and registration.
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
TRL-849 supplies durable host exclusion; TRL-696 supplies Trellis-side composition.
The producer does not release the outer pause, start jobs, or activate restored data.

`exportEngineSnapshot` in `services/langflowBackup/engineSnapshot` calls this protocol through the authenticated loopback endpoint.
It streams both files into the prepared `engine` and `secrets` roots, verifies the receipt and content, then syncs the files and directories.
A failed download retains partial files and does not write a completed receipt.
The caller holds the coordinated pause until `captureSnapshot` finishes its manifest.
Native workspace and conversation exports remain separate required producers.

The Python fixture creates a real suspended job, checkpoint, and correlation receipt with Langflow services.
It mounts the backup domain with `create_engine_api_router` and `EngineApiSecurity`.
It exports through that common router, reopens the copy, and checks the original identity and checkpoint.
It also checks that a later checkpoint write remains in the source database.
The fixture uses the durable grant ledger and separate issuer credential.
Integrated effect exclusion and restored ownership remain separate proof requirements.
TRL-667 owns candidate patch application and the matched batch command.

```sh
TRELLIS_ROOT=/path/to/trellis LANGFLOW_SOURCE_ROOT=/path/to/candidate/source \
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/path/to/candidate/source/src/backend:/path/to/candidate/source/src/backend/base:/path/to/candidate/source/src/lfx/src \
/path/to/candidate/venv/bin/python -m pytest -q -c /path/to/candidate/source/pyproject.toml \
-p tests.conftest /path/to/trellis/integrations/langflow/tests/restore/test_engine_snapshot.py \
/path/to/trellis/integrations/langflow/tests/restore/test_capture_store.py \
/path/to/trellis/integrations/langflow/tests/restore/test_capture_boundary.py \
/path/to/trellis/integrations/langflow/tests/restore/test_capture_router.py
```

Use a private `LANGFLOW_CONFIG_DIR`, HOME, and TMPDIR with the candidate command.
Keep `LANGFLOW_TEST_DATABASE_URI` empty for the isolated SQLite fixture.


## Capture authority and writer exclusion

`CaptureGrantStore(directory, identity)` receives the trusted current `CaptureIdentity` and an existing directory with mode 0700.
Startup places this directory at `/data/config/trellis-capture`, within the private persistent volume and outside the exported job database.
The store uses `capture-authorities.sqlite` and `capture-authorities.lock` in that directory.
`CaptureBoundary(store)` uses `capture-writers.lock` beside them.
The startup owner retains this control state across restarts and does not replace it with restored job bytes.

`create_capture_authority_router(boundary=boundary, issuer_file=path)` returns the relative `/capture-authorities` router.
TRL-875 supplies `path` from `TRELLIS_CAPTURE_ISSUER_FILE`, mounted at `/run/trellis-secrets/capture-issuer`.
The constructor requires an owner-matched regular file with mode 0600 and reads its exact bytes.
Each control request requires `X-Trellis-Capture-Issuer` in addition to the bearer required by the common `/trellis-v1` router.
The issuer header uses a constant-time comparison.
Snapshot requests use only the engine bearer.

`POST /trellis-v1/capture-authorities` accepts `{grantBytes}` and returns `{grantBytes,state,receiptId}`.
`GET /trellis-v1/capture-authorities/{id}` returns the saved receipt.
`POST /trellis-v1/capture-authorities/{id}/revoke` accepts `{grantBytes}` and returns a revoked receipt.
The receipt digest covers compact UTF-8 JSON with `grantBytes` first and `state` second.
The ledger retains the exact supplied grant string.

Commit requires the exact current runtime identity.
A new grant requires a generation greater than every saved generation and an empty active slot.
The same ID and bytes return the saved state, including a revoked state.
Changed bytes conflict.
An unknown revocation saves a permanent revoked record before it returns.
A delayed commit therefore cannot activate that grant.

A successor can revoke an old grant for the same host and data home.
Its trusted host caller must first confirm retirement through a fresh supervisor observation.
The engine permits lookup of an old revoked receipt and rejects lookup of an old active receipt.
Commit still requires the current instance, owner, package, host, and home.
`BEGIN IMMEDIATE` and the private file lock serialize ledger operations.

The startup owner passes `boundary.snapshot` to `create_backup_router` as `snapshot_boundary`.
That context reads the durable active grant and checks its current identity, snapshot, home, host, and boundary receipt.
It holds shared file exclusion until the export completes, including after request cancellation.
Commit and revoke require exclusive file exclusion.
A revoke therefore waits for active exports before it saves the revoked state.

Every engine writer must enter `async with boundary.writer():` before its database transaction or executor handoff.
The writer holds shared file exclusion through that operation.
An active persisted grant raises `CapturePaused` before the writer starts.
The queue must defer that operation while it retains the original job and receipt.
TRL-669 owns the hooks in graph, job, checkpoint, continuation, and queue code.
Those hooks remain required before startup mounts these routers.
The isolated boundary fixtures do not prove that every engine writer uses them.

The host sequence is close and drain, issue, commit, export both stores, seal, revoke, then reconcile.
A lost control response retains the closed host block; an authenticated lookup recovers the exact receipt.
Export failure retains the active grant.
Only the host can reopen its outer block after validated revocation and the exact seal receipt.
