# Authority recovery queries

`listAuthorityExecutions(tx, {hostId, afterExecutionId, limit})` returns `{items: {executionId}[], nextAfterExecutionId}`. It reads bound active executions on the named host. It also reads canceled executions whose engine cancellation is pending or unknown. The keyset cursor retains access to every matching execution.

`readTakeoverStops(tx, {executionId})` returns `{ready, sourceBytes, sourceDigest}`. It locks the execution until the caller transaction ends. Every stored stop obligation must name a native attempt with a confirmed exact exit. Canceled executions require this evidence for every native attempt. Other executions retain attempts that have no stop obligation.

The source bytes contain the execution revision, cancel intent, exact native identities, and all stop obligations in stable order. The caller retains these bytes in its authority commit. The authority adapter must read this evidence and commit the successor within the same transaction.

Three migrated fixtures cover surviving attempts, pending and confirmed stops, missing cancellation stops, host selection, and the keyset cursor. Their execution is deferred until the complete source batch.
