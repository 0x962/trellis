# Durable dispatch permits

`DispatchGate` keeps effect permits in a private file outside the databases and restored payloads.
Composition assigns one permanent control directory to each target `dataHomeId`.
All host processes for that home must open that same directory.
`create` initializes a new directory exactly once; `open` refuses missing state.
Deleting or copying this directory can invalidate authority and is not a restore operation.

The state includes the target home, generation, block, every effect permit, terminal receipts, and reconciliation receipts.
Each mutation takes a kernel lock, writes a private temporary file, syncs it, renames it, and syncs the directory.
Another process that holds the mutation lock causes an explicit error.
The kernel releases the mutation lock after a process exit; durable permits remain pending.

## Effects

Acquire a permit before the first database write or remote dispatch for each effect.
Supply the exact effect identity, payload digest, request, execution, job, and native attempt.
Use null only for an identity that does not exist at that stage.
A logical effect gets one permit; a second acquire refuses even after settlement.
A caller that loses the acquire response must reconcile the saved permit before it can proceed.
A saved permit is evidence of uncertainty, not permission to repeat an effect.

`read` and `assertDispatchAllowed` support status and diagnostics.
Their result cannot authorize an effect because a block can follow the read.
The acquired permit remains pending until `settle` validates an exact durable terminal receipt.
A timeout, transport error, or process exit does not release it.
Never call `settle` from an unconditional finally block.
History and native stop controls remain available through their existing paths.

`DispatchEvidence.readTerminal` must read authoritative, immutable evidence.
It must prove that the exact effect completed, was refused, or was cancelled with no possible future effect.
A request acknowledgement or an unknown remote result cannot establish that condition.
Reconciliation can settle an unresolved permit with that same evidence interface.

## Block and drain

`closeDispatch` saves a closed generation and returns its exact block.
`waitForDrain` waits for every pending permit to receive terminal evidence.
`blockDispatch` combines these operations.
Call it outside database transactions and before export or restore changes any bytes.
The wait holds no database or mutation lock, so existing effects can save their terminal evidence.
Abort cancels only the wait; the durable block remains closed.

A restore reason binds the canonical recovery envelope, snapshot identifier, source home, and manifest digest.
The target home comes from composition and remains distinct from the source home.
The envelope contains exported roots; it does not become an active home through this API.
A capture reason binds its snapshot identifier.
Keep the capture block closed through engine export and `sealSnapshot` completion.

## Release authority

`reconcile` drains before it calls the trusted `withReconciliation` adapter.
The adapter must read and verify durable receipts for the exact block and target home.
These receipts cover the package, both databases, secrets, current ownership, native attempts, and stop obligations.
A capture also requires the sealed snapshot receipt.
The adapter must exclude ownership changes and conflicting reconciliation until the commit callback returns.
It must preserve original native provenance, pending receipts, and deadlines.
The adapter saves its immutable evidence before it invokes the callback exactly once.
It must never acquire a gate permit or wait for drain inside that callback scope.

The commit callback checks the exact block and zero pending permits under the mutation lock.
It saves the reconciliation receipt, advances the generation, and reopens dispatch.
A restore request that already reconciled cannot close the gate again with the same request identifier.
`DispatchEvidence` has no default implementation.
TRL-696 supplies the authoritative receipt readers, exclusion, and all effect hooks.

## Verification boundary

The fixtures exercise real files, kernel locks, process exit, cross-process settlement, and drain notification.
Receipt readers in these fixtures use synthetic evidence.
The integrated application paths must separately prove that their terminal receipts prevent future effects.
Installed restore, OCI transport, and production activation require their own acceptance evidence.
