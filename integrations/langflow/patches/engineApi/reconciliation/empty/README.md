# Engine emptiness under a reconciliation lease

Apply `0003-read-empty-under-lease.patch` after the lease-bound authority reader.

The follow-up adds `GET /trellis-v1/reconciliation-leases/{leaseId}/empty`.
The shared engine router requires the normal bearer.
The reconciliation router also requires `X-Trellis-Reconciliation-Issuer`.

The read holds `capture-writers.lock` in shared mode.
It requires the exact durable lease to remain active.
It then opens the configured SQLite database in read-only mode.
It does not use `session_scope`.

The response is `{ "empty": boolean }`.
The value is true only when all these concrete sources contain no retained work:

- `job`
- `trellis_delivery_authorities`
- `trellis_job_correlations`
- unconsumed rows in `trellis_decision_enqueue_obligations_v1`
- obligation or continuation rows in `job_checkpoints`
- unconsumed rows in `execution_signals`

This fragment adds no caller flag, mutation, scheduler, retry, or activation path.
Initialization must remain refused until the host validates a true response from the current lease.
