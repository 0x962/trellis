# Engine reconciliation lease

`EngineReconciliation({control,supervisor,dependencies?})` uses the private `/trellis-v1/reconciliation-leases` routes.
The control supplies its durable identity and `gate.read`.
`provisionReconciliationIssuer(identity)` creates or reads the separate private issuer file when trusted composition explicitly calls it.
The OCI driver must mount that credential before the client can operate.

`acquire(block,signal)` requires the exact current closed block and no outstanding effects.
It retains immutable lease bytes outside the restored home before the HTTP request.
The lease binds the supervisor instance, block generation, and issuer digest.
An unknown response returns null and retains the request for exact replay.

`read(block,signal)` reads the durable engine receipt and the current engine identity under the active lease.
It compares the live package, config, SQLite digest, Alembic heads, secret digest, and runtime identity with the acquired evidence.
A difference refuses reconciliation.
The engine lease excludes writers between these HTTP reads.
The caller must still compare these facts with its verified package and database sources.

`release(block,receiptId,signal)` requires the exact saved gate reconciliation receipt.
It retains the acknowledgement before its HTTP request.
An unknown release leaves that acknowledgement available for replay.
A changed engine instance requires explicit recovery and cannot reuse the lease.
This client does not itself release the host gate or prove destination database association.
