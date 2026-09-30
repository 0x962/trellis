# Authority reads under a reconciliation lease

Apply `0002-read-authority-under-lease.patch` after the engine reconciliation lease fragment.

The follow-up adds `GET /trellis-v1/reconciliation-leases/{leaseId}/authorities/{executionId}`.
The shared engine router requires the normal bearer.
The reconciliation router also requires `X-Trellis-Reconciliation-Issuer`.

The read holds `capture-writers.lock` in shared mode.
It reads the capture store before the reconciliation store.
It requires the exact durable lease to remain active.
It then opens the configured SQLite database in read-only mode.
It does not use `session_scope`.

The response uses the existing authority wire fields: `authorityBytes`, `authorityDigest`, `authority`, and `revokedAt`.
The reader verifies the original authority bytes against every stored identity column.
An absent authority returns 404.

This fragment does not weaken writer exclusion.
It adds no mutation, scheduler, retry, or activation path.
TRL-1155 owns the host comparison of these bytes.
