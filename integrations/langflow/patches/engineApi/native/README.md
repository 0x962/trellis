# Native engine API

The source files install under `langflow.services.trellis_v1` in the pinned engine.
`native_protocol.py` validates the public native result and exact UTF8 bytes.
`native_ledger.py` stores acceptance, the resume signal, and the queue obligation in one caller transaction.
`native_records.py` reads the original graph wait and native request checkpoint.
`native_router.py` exposes the private HTTP routes.

`create_native_router(jobs, executor, authorize, open_session)` requires trusted host dependencies.
`authorize(request, permission, binding)` must authenticate the private Bearer value and capability header.
It must return the current persisted `DeliveryAuthorityV1` after it checks identity, epoch, expiry, and admission.
The binding comes from a saved wait or the validated native result.
The ledger calls this function while it holds the engine job lock.
TRL-875 owns this authentication and router registration.

| Route | Permission | Body or result |
| --- | --- | --- |
| `POST /trellis-v1/native/completions` | `completion.deliver` | `{engineWaitId,resultBytes,deliveryBytes}`; exact `CompletionReceiptV1` response bytes |
| `GET /trellis-v1/native/jobs/{job_id}/waits/{wait_id}` | `native.read` | Saved wait, result, and acceptance bytes with `waiting` or `completed` state |

`resultBytes` contains the exact original `NativeResultV1` serialization.
`deliveryBytes` contains `CompletionDeliveryV1` with the current grant and original result digest.
A replay can carry a renewed grant but must preserve the original result bytes.
The engine returns the original acceptance and obligation identities.
The POST consumes the saved obligation after the acceptance transaction commits.
If dispatch fails, the durable obligation stays pending for the engine startup drain.

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
The consumer owns the later state update.
The resume signal uses `trellis_external_completion_v1`, the exact wait ID as `engineRequestId`, null `decisionId`, and the obligation ID.

## Assembly and verification

TRL-674 owns the shared patch series and the dependency order.
The manifest records source and patch hashes for that assembly.
The tests use the actual engine models, the caller-session helper, and an isolated SQLite database.
They cover rollback, replay after reopen, exact result bytes, authority, attempt identity, prompt receipts, and complete output.

Run the fixtures in the existing pinned environment after the complete source batch merges:

```sh
pytest integrations/langflow/patches/engineApi/native/tests
```
