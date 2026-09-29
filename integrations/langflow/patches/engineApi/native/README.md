# Native engine API

The source files install under `langflow.services.trellis_v1` in the pinned engine.
`native_protocol.py` validates the public native result and exact UTF8 bytes.
`native_ledger.py` stores acceptance, the resume signal, and the queue obligation in one caller transaction.
`native_records.py` reads the original graph wait and native request checkpoint.
`native_router.py` exposes the private HTTP routes.

`create_native_router(jobs, executor, security, open_session)` requires trusted host dependencies.
`security` is the shared `EngineApiSecurity` from TRL-875.
Each route verifies the startup bearer and the capability header.
The ledger locks the job before the route calls `security.require_authority` in that same session.
This check binds the exact authority bytes to the execution, publication, job, expiry, and permission.
The shared router mounts the relative `/native` routes under `/trellis-v1`.

| Route | Permission | Body or result |
| --- | --- | --- |
| `POST /trellis-v1/native/completions` | `completion.deliver` | `{engineWaitId,resultBytes,deliveryBytes,authorityBytes}`; exact `CompletionReceiptV1` response bytes |
| `POST /trellis-v1/native/lookup` | `native.read` | `{jobId,waitId,authorityBytes}`; saved wait, result, and acceptance bytes |
| `POST /trellis-v1/native/input-receipts` | `native.read` | `{requestBytes,authorityBytes}`; ordered `{receiptId,receiptBytes,receiptDigest}[]` |

`authorityBytes` contains the exact persisted grant serialization.
`X-Trellis-Capability-Id` must match that grant.
`resultBytes` contains the exact original `NativeResultV1` serialization.
`deliveryBytes` contains `CompletionDeliveryV1` with the current grant and original result digest.
A replay can carry a renewed grant but must preserve the original result bytes.
The engine returns the original acceptance and obligation identities.
The POST consumes the saved obligation after the acceptance transaction commits.
If dispatch fails, the durable obligation stays pending for the engine startup drain.

The input-receipt route derives the job and publication from the original request bytes.
It locks the job before the shared authority check, then calls `occurrence_receipts.read_input_receipts` in that session.
The helper verifies the original journal request and reads its ordered receipt records.
The response preserves each receipt string and digest and uses `Cache-Control: no-store`.
Missing jobs or receipts and changed requests return a conflict.

## Required engine interfaces

TRL-669 owns `TrellisExternalWaitBroker.save_completion_in_session(session, *, job_id, authority_epoch, wait_bytes, delivery_bytes, receipt_bytes)`.
The helper uses the caller session and preserves the completion envelope bytes.
The ledger must never call the wrapper that opens another transaction.

TRL-669 owns `BackgroundExecutionService.consume_external_completion_obligation(obligation)`.
The consumer calls the existing continuation path after commit.
Its startup drain reads pending obligations and marks them consumed only after confirmed dispatch.
The graph selects successors, joins, and loop rounds.

The producer stores exact request bytes in `JobCheckpoint` under `trellis-native-request-v1:<sha256(waitId)>`.
The graph checkpoint stores the corresponding `ExternalWaitV1` bytes in `external_waits[waitId]`.

The acceptance key is `trellis-native-acceptance-v1:<sha256(waitId)>`.
Its JSON holds `waitBytes`, `requestBytes`, `resultBytes`, `deliveryBytes`, and `obligation`.
The obligation holds `version`, `engineJobId`, `engineWaitId`, `completionId`, `signalId`, `enqueueObligationId`, and `receiptBytes`.

The pending key is `trellis-native-obligation-v1:<enqueueObligationId>`.
Its JSON holds the obligation fields plus `state: "pending"` and `continuationReceiptBytes: null`.
`NativeCompletionLedger.pending()` returns the pending obligation objects.
`mark_consumed(obligation, continuation_receipt_bytes)` verifies the saved obligation and exact durable continuation receipt before it marks consumption.
The consumer calls this method only after confirmed dispatch.
An equal receipt replays; changed bytes or identities fail.
The resume signal uses `trellis_external_completion_v1`, the exact wait ID as `engineRequestId`, null `decisionId`, and the obligation ID.

## Assembly and verification

TRL-674 owns the shared patch series and the dependency order.
The native router requires the TRL-1006 `occurrence_receipts` source and the shared TRL-875 authentication source.
The manifest records source and patch hashes for that assembly.
The tests use the actual engine models, the caller-session helper, and an isolated SQLite database.
They cover rollback, replay after reopen, exact result bytes, authority, attempt identity, prompt receipts, and complete output.

Run the fixtures in the existing pinned environment after the complete source batch merges:

```sh
pytest integrations/langflow/patches/engineApi/native/tests
```
