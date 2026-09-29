# Private admission routes

The fragment adds `admission_models`, `admission_lookup`, `admission_store`, `admission_request`, `admission_service`, and `admission_router` under `langflow.services.trellis_v1`.
The source files and patch contain the same bytes.
Apply the correlation, external-wait, schema, publication, shared security, and admission transaction fragments first.
TRL-674 owns the combined series.

`create_admission_router(*, service: AdmissionService, security: EngineApiSecurity)` returns an `APIRouter`.
Its relative prefix is `/admission`.
The shared engine router mounts it under `/trellis-v1`.
Every request uses `security.require_transport_auth` and requires `Authorization: Bearer <exact authentication file contents>`.
Trusted startup creates the security object from its private file and engine identity.
TRL-875 owns the common authentication, authority, and router registration.
TRL-696 owns the Trellis transport composition.

## Wire contract

All three routes use POST with a JSON body.
Unknown fields and field coercion are rejected.
The `Bytes` fields carry strings whose UTF-8 encoding is the original protocol document.
The server does not parse and serialize these strings to replace the retained bytes.
There is no application payload ceiling.

| Path | Request | Response |
| --- | --- | --- |
| `/submit` | `{envelopeBytes: string, payloadBytes: string}` | `{state: "found", receiptBytes: string}` or `{state: "unknown", key: EngineKey}` |
| `/lookup` | `{version: 1, hostId: string, executionId: string}` | The found or unknown result above, or `{state: "absent", key: EngineKey, authoritative: true}` |
| `/open` | `{receiptBytes: string, authorityBytes: string}` | `{state: "admitted", receiptBytes: string}`, `{state: "pending"}`, or `{state: "unknown"}` |

`EngineKey` is the complete lookup request.
The transport parses a returned receipt string into the existing V1 receipt schema.
An HTTP failure or lost response does not establish absence or permission to resubmit.
A protocol conflict returns 409.
An invalid request returns 422.
An authentication failure returns 401.
The authority service rejects an invalid or revoked grant before the domain mutation.

## Trusted service inputs

`AdmissionService(*, jobs, background, host_id: str)` requires the actual `JobService` and `BackgroundExecutionService`.
`host_id` is the stable host identity from trusted startup configuration.
`enqueue_trellis_submission` dispatches the already committed job through the existing engine queue.
The request uses the pinned `WorkflowRunRequest` fields and the original engine session ID.
It selects the immutable engine flow and background mode with the Langflow stream protocol.
The queue producer binds the request digest and encrypted metadata before execution.
It handles replay, lease retry, prior execution, and cancellation.
A nonterminal replay supplies the same saved job and exact request bytes.
TRL-669 supplies this producer in `externalWaits/0002-queue-bootstrap-and-completion-transactions.patch`.

Submission verifies the exact payload digest against the reserved envelope.
The payload contains exactly `publication` and `snapshot`.
`resolve_publication(session, snapshot, publication)` reads the retained publication and returns its engine flow and user IDs.
The publication producer owns this resolver.
`CorrelationCoordinator.accept_submission` commits the job and permanent receipt through `JobServiceCorrelationStore`.
The initial queue call runs after that commit.
An equal terminal replay returns the original receipt without another dispatch.

Lookup reads the permanent `TrellisJobCorrelation` row by host and execution.
Only a successful database query with no row returns authoritative absence.

Admission reads the actual `GraphCheckpoint` and selects the wait whose barrier matches the permanent correlation.
The job and wait determine stable signal and enqueue UUIDs.
`CorrelationCoordinator.open_admission` commits the receipt and continuation obligation.
`BackgroundExecutionService._consume_trellis_admission_obligation` uses the existing continuation queue after that commit.
A replay retains the original receipt and dispatches its pending obligation through the same consumer.

The `/open` route passes exact authority bytes and `security.require_authority` to the domain service.
`AuthorizedCorrelationStore` passes a required verifier to `JobService.commit_trellis_admission`.
`0002-authorize-admission-transaction.patch` adds the required verifier keyword to the job service.
The job service calls that verifier in its own database session after it locks both the correlation and job rows.
Apply this narrow patch after the combined backend and external-wait fragments.
Direct callers must supply the verifier for both first admission and replay.
The verifier checks `native.reserve` and the exact execution, publication, job, epoch, and host.
The shared authority service locks the authority row and checks its current owner, capability, scope, permission, and expiry.
The transaction retains both locks until the admission receipt and continuation obligation commit.
A repeated admission request uses the same verifier before it returns the saved receipt.
Only after commit does the background service consume the continuation obligation.

## Trellis recovery

`ReconcileDependencies.readAuthorityBytes(authority)` returns the original text from the durable issuance archive.
Reconcile validates the parsed grant against the stored authority and passes the unchanged text to `engine.admit`.
The HTTP adapter sends this text as `authorityBytes`.
Missing bytes or a different grant prevent admission.
TRL-676 owns the initial issuer and its immutable archive.
TRL-696 supplies the issuer and byte reader through the composition dependencies.
Its outer delivery scope retains the admission or recovery permit until the engine acknowledgement commits in Trellis.
An unknown result keeps that permit pending.
The composition owner confirmed this contract; its delivery wrapper still requires implementation.

## Verification

`tests/test_admission_router.py` covers bearer rejection, exact UTF-8 bytes, unknown lookup, strict bodies, authority rejection, and terminal replay.
Its authority and HTTP domain fixtures verify callback order, the shared bearer check, and wire behavior.
Durable authority exclusion and real queue execution require the integrated database fixtures.
The fixtures remain unrun under the current capacity hold.
Integrated verification must use the pinned engine with all required fragments and the actual authority store and queue.
