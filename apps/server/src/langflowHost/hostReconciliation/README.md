# Host reconciliation

`reconcileHostControl` runs as a prepared system service in the database worker.
Its request and result types are `HostReconciliationInput` and `HostReconciliationResult`.
The function uses the worker home, boot ID, clock, and transaction runner.

The main host holds these boundaries across both `prepare` and `commit`:

1. Close the durable dispatch gate and await its outstanding effects.
2. Pause ordinary lifecycle work, then freeze and await stop work.
3. Hold `LangflowSupervisor.withHealthyEngine` for the current instance.
4. Acquire the durable engine reconciliation lease.
5. Call the worker with `operation: "prepare"` and a null receipt ID.
6. Call `commit` with the returned receipt ID and the same observation.
7. Release the engine lease with the committed receipt, then resume lifecycle work.

An exception or a blocked result retains the closure and the engine lease.
A lost commit response permits a lookup of the exact durable gate receipt.
The host must confirm engine lease release before it resumes lifecycle work.

The worker rereads the private process identity and authenticates each engine request.
It reads authority through the exact active reconciliation lease.
The ordinary authority route cannot run while that lease excludes engine database sessions.
The worker also holds native snapshot retention and every exact attempt lock.
It compares current ownership and stop records inside its final database transaction.
That transaction and the native locks remain held through the receipt archive and gate release.

Initialization requires an empty Trellis execution table and an authenticated empty engine store under the same lease.
A missing owner fence is valid only in that empty initialization scope.
Any saved revocation prevents release.

For capture and restore, the worker compares the exact sealed migration and execution facts with current facts.
For restore, it also compares the actual database-open receipt for the current boot.
A changed migration, ownership row, native association, deadline, or stop record refuses release.
The physical engine database digest, package, Alembic heads, and encryption secret must match the seal.
These checks preserve the original fact strings.

Workspace and conversation entries marked unavailable prevent release.
Restore also refuses release with `host_reconciliation_destination_components_unverified` after the database comparison.
Component archives prove captured bytes, even when every export is available.
Destination installation and provider identity require an actual retained receipt and current verification before restore can release dispatch.
The native boundary covers private launch snapshots and Trellis attempt operations.
It does not prove a consistent export of live provider workspace or conversation files.
Startup changes can also prevent an exact comparison with the sealed database.
Such differences require explicit reconciliation evidence before release.

The source fixtures use isolated files and synthetic HTTP responses.
They do not prove a composed restore, engine exclusion, or installed operation.
