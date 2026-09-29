# Engine reconciliation lease

This fragment adds a durable engine lease for host reconciliation. It does not activate the private API or release the host dispatch gate.

The shared engine API mounts `create_reconciliation_router(...)` under `/trellis-v1`. The domain routes are:

- `POST /reconciliation-leases`
- `GET /reconciliation-leases/{leaseId}`
- `GET /reconciliation-leases/{leaseId}/identity`
- `POST /reconciliation-leases/{leaseId}/release`

The common bearer protects every route. The domain also requires `X-Trellis-Reconciliation-Issuer`. Startup reads the exact issuer from `TRELLIS_RECONCILIATION_ISSUER_FILE`.

The lease binds the dispatch block, data home, generation, runtime identity, and SHA256 of the issuer credential. The ledger retains the original lease bytes. An exact retry returns the original record. A changed lease with the same identifier returns a conflict.

`CaptureBoundary` uses this lock order:

1. `capture-writers.lock`
2. `CaptureGrantStore`
3. `ReconciliationLeaseStore`

An active capture grant blocks reconciliation acquisition. An active reconciliation lease blocks capture commit, capture snapshot, database sessions, and graph passes. The lease remains active after a process restart. An unknown acquire or release response requires a read of the retained record.

Lease acquisition runs `PRAGMA wal_checkpoint(TRUNCATE)` under the exclusive writer lock. It rejects a busy or incomplete checkpoint. It then hashes the actual configured SQLite file and records its size. It also records sorted Alembic heads, the active secret SHA256, the installed package fields, the exact engine configuration SHA256, and the runtime identity.

The host releases the lease only after it commits the reconciliation receipt and releases the exact dispatch block. Release stores the exact host acknowledgement before it clears the active lease. The route then calls `BackgroundExecutionService.resume_after_capture()` before it returns.

The host must supply the issuer credential and the exact lease bytes. The current driver does not yet mount that issuer file. A restore must verify the restored database before startup writes or migrations. These source files prove no runtime exclusion, restored-byte match, host gate release, or activation.
