# Private admission routes

The fragment adds `admission_models`, `admission_lookup`, `admission_service`, and `admission_router` under `langflow.services.trellis_v1`.
The source files and patch contain the same bytes.
Apply the correlation, external-wait, schema, and publication fragments first.
TRL-674 owns the combined series.

`create_admission_router(*, authentication_file: Path, service: AdmissionService, authority: AdmissionAuthority)` returns an `APIRouter`.
The prefix is `/trellis-v1/admission`.
Every request requires `Authorization: Bearer <exact authentication file contents>`.
The router does not trim the token or accept browser configuration.
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
| `/open` | `{receiptBytes: string, authority: DeliveryAuthorityV1}` | `{state: "admitted", receiptBytes: string}`, `{state: "pending"}`, or `{state: "unknown"}` |

`EngineKey` is the complete lookup request.
The transport parses a returned receipt string into the existing V1 receipt schema.
An HTTP failure or lost response does not establish absence or permission to resubmit.
A protocol conflict returns 409.
An invalid request returns 422.
An authentication failure returns 401.
The authority service rejects an invalid or revoked grant before the domain mutation.

## Trusted service inputs

`AdmissionService(*, jobs, background, host_id: str, dispatch_submission)` requires the actual `JobService` and `BackgroundExecutionService`.
`host_id` is the stable host identity from trusted startup configuration.
`dispatch_submission(record: StoredCorrelation) -> Awaitable[None]` is a required initial dispatch port.
Its producer must use the existing engine queue and the already committed job.
It must preserve the engine session, admission barrier, saved request, and launch context.
It must tolerate replay and recover a crash between reservation and dispatch.
It must not call a submission method that creates another job.
TRL-669 owns the engine queue contract.
This fragment does not supply that initial queue implementation.

Submission verifies the exact payload digest against the reserved envelope.
The payload contains exactly `publication` and `snapshot`.
`resolve_publication(session, snapshot, publication)` reads the retained publication and returns its engine flow and user IDs.
The publication producer owns this resolver.
`CorrelationCoordinator.accept_submission` commits the job and permanent receipt through `JobServiceCorrelationStore`.
The dispatch port runs after that commit.
An equal terminal replay returns the original receipt without another dispatch.

Lookup reads the permanent `TrellisJobCorrelation` row by host and execution.
Only a successful database query with no row returns authoritative absence.

Admission reads the actual `GraphCheckpoint` and selects the wait whose barrier matches the permanent correlation.
The job and wait determine stable signal and enqueue UUIDs.
`CorrelationCoordinator.open_admission` commits the receipt and continuation obligation.
`BackgroundExecutionService._consume_trellis_admission_obligation` uses the existing continuation queue after that commit.
A replay retains the original receipt and dispatches its pending obligation through the same consumer.

`AdmissionAuthority.guard(authority: dict, *, permission: str)` returns an asynchronous context manager.
The router requests `native.reserve` and holds this context through the admission commit.
The trusted producer must verify the exact current owner, epoch, capability, scope, permission, and expiry.
It must exclude revocation and takeover until the mutation commits.
A comparison with the request body alone does not satisfy this contract.
This fragment requires that producer; it does not implement a durable authority store.

## Verification

`tests/test_admission_router.py` covers bearer rejection, exact UTF-8 bytes, unknown lookup, strict bodies, authority rejection, and terminal replay.
Its authority and HTTP domain fixtures verify callback order and wire behavior.
They do not prove durable authority exclusion or real queue execution.
The fixtures remain unrun under the current capacity hold.
Integrated verification must use the pinned engine with all required fragments and the actual authority and initial queue producers.
