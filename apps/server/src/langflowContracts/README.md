# Native protocol version 1

This module defines the internal Trellis and Langflow boundary.
`index.ts` exports strict Zod schemas and inferred types.
`fixtures/` contains serialized examples with fixed identities and timestamps.
These fixtures prove boundary validation, not engine recovery or installed behavior.

Langflow owns successors, joins, branch selection, loop rounds, and graph continuations.
Trellis owns native reservations, process observations, result receipts, human authority, and stops.
The bridge validates engine-selected occurrences against the immutable publication.
It must not derive a successor, join result, or next round.

## Identity and exact bytes

Versioned records carry `version: 1`.
References identify stored records; they do not contain paths, credentials, commands, or account secrets.
Provider sessions are opaque references.
Output text remains user data and requires the existing access controls.
Strict objects reject extra fields at every structured boundary.

`protocolDigest` hashes exact UTF-8 bytes with SHA-256.
Senders retain the original serialized bytes for replay.
Field order, whitespace, and output newlines remain significant.
`readProtocolBytes(schema, bytes, storedDigest)` rejects changed bytes before it parses a repeated message.
The caller obtains `storedDigest` from the locked authoritative identity row.
A caller-supplied digest cannot establish an existing identity.
The first write stores the bytes, digest, and receipt atomically under a unique key.
An equal duplicate returns the saved receipt without another effect.

| Record | Permanent unique key | Conflict comparison |
| --- | --- | --- |
| Public start | Actor kind, actor name, requestId | Original start bytes |
| Engine correlation | hostId, executionId | Original submission bytes |
| Native reservation | executionId, nodeId, parentOccurrenceKey, phase, full iterationPath | Original NativeRequestV1 bytes |
| Native request replay | executionId, requestId | Same reservation and request bytes |
| Native result | completionId; also exact attemptId and resultId/resultVersion | Original NativeResultV1 bytes |
| Human decision | decisionId; also engineJobId and engineRequestId | Original HumanDecisionReceiptV1 bytes |
| Engine acceptance | decisionId | Same payloadDigest and human wait |
| Ownership transfer | executionId, requestId | Original TakeoverRequestV1 bytes |
| Source event | engineJobId, sourceEventId | Original SourceEventV1 bytes |

The stores enforce both keys where the table lists two keys.
`occurrenceKey` identifies the complete semantic tuple; changing that label cannot create another occurrence for the same tuple.
The iteration path lists every enclosing loop from outermost to innermost.
Round numbers are positive integers.
The contracts impose no round count, reference length, deadline budget, or replay page ceiling.
Safe integers preserve exact numeric identity in JSON and TypeScript.
SHA-256 digests and UUIDs retain their required formats.
An empty path identifies work outside a loop.
`phase` distinguishes `step`, `children`, and `condition`.
The bridge checks these values against the engine checkpoint and publication before reservation.

## Submission and admission

The engine permanently retains one job association for each correlation key, including failed, canceled, and timed-out jobs.
Only an authoritative `absent` lookup permits initial submission.
An `unknown` lookup blocks another submission.
The engine session identifies one Trellis execution and cannot serve another execution.

Trellis starts each execution with closed admission.
The engine stores an admission wait and releases its worker before native effects.
A worker that polls the barrier does not satisfy this contract.
Trellis atomically stores correlation and the admission receipt before it permits native reservation.
`NativeRequestV1` must match that receipt and the current authority at the time of the first reservation.
An open admission record never overrides a cancellation or revoked owner.
Submission uncertainty after that commit preserves all effects and stop obligations.

| Transaction owner | Atomic writes | Kill points and required recovery |
| --- | --- | --- |
| Trellis | Start key, execution, closed admission | Before/after commit: same execution or no reservation |
| Engine | Permanent correlation, job, durable enqueue | Before/after commit and before response: lookup returns the original job or authoritative absence |
| Engine | Continuation and admission wait | Before/after wait commit: zero native effects while admission stays closed |
| Trellis | Exact job association, open admission receipt, admission outbox | Before/after commit: closed admission or retained receipt and effects |
| Engine | Admission consumption and continuation obligation | Before/after commit and lost response: consume the same receipt once |

## Native attempts and results

Trellis reserves the step, agent run, attempt, request bytes, and immutable provenance in one transaction before launch.
Workspace and provider session IDs can remain null in the first handle.
Trellis reconciles a lost launch response against the exact reserved attempt.
Unknown process ownership blocks a replacement attempt.

`NativeCompletionV1` binds the result to the reserved attempt, provider session, request digest, and original engine binding.
The initial prompt receipt uses the attempt ID, as the current native launch contract requires.
The trusted native observer must verify that the runtime actually acknowledged that prompt and produced that final result.
An engine event cannot supply that proof.
`NativeResultV1.outputHash` covers the exact output bytes.
An error without a final result uses `FailureV1`; it does not invent result or session identities.

Trellis commits the accepted result and completion outbox together.
The engine commits completion consumption, the updated wait set, and its continuation obligation together.
Duplicate completion delivery returns the saved `CompletionReceiptV1`.
Cancel intent blocks continuation even if a late native result remains available for audit.

## Human acceptance

Human and native waits have different discriminants and schemas.
Only the human decision route accepts a `HumanDecisionReceiptV1`.
Trellis authenticates the human actor and compares the exact action key, pending occurrence, and expected revision.
It commits the decision and delivery outbox together.

The engine locks the human wait and the decision identity.
It commits acceptance, the resume signal, and the enqueue obligation in one engine transaction.
`DecisionAcceptanceV1` names all three durable records.
An equal decision returns that original acceptance.
A changed digest or a decision for another wait conflicts without another resume.

Trellis queries `DecisionLookupRequestV1` after a lost acknowledgement.
Only `accepted` with the exact decision, digest, job, and request confirms delivery.
An upstream HTTP 409 does not confirm acceptance.
`recorded`, `pending`, and `unknown` retain null acceptance.
Expiry and engine restart never approve a human request.

## Execution ownership

`NativeLaunchProvenanceV1` remains immutable across every restart and takeover.
`DeliveryAuthorityV1` carries current authority separately from that provenance.
The capability ID references an authenticated grant; the serialized ID itself grants no access.
Authentication stays in the private transport.

Only the trusted host supervisor can request takeover or renewal.
It first establishes live ownership and revokes the prior owner's command authority.
The revocation record must prove the prior owner cannot dispatch; an epoch increment alone does not prove this.
Unknown ownership blocks takeover and native dispatch.

Trellis compares owner, epoch, and revision under the execution lock.
One transaction records revocation, advances ownership, and stores the takeover receipt.
If admission already permits effects, that transaction issues a new admission receipt for the new epoch.
The new receipt retains the job, publication, and submission digest.
Closed admission stays closed through takeover.
Existing launch provenance retains its original admission receipt.
Concurrent transfers from the same revision produce one receipt and one conflict.
Every effect checks the current authority within the same lock as its reservation.
Previously admitted reservations remain owned and require exact-attempt recovery.

The supervisor renews an expired capability only after another live ownership check.
Renewal retains the owner and epoch and uses `expectedRevision` to exclude concurrent changes.
It advances the ownership revision and stores the replacement capability atomically.
Pending outboxes attach that current authority without changing their payload bytes or receipt identities.
The new owner can deliver an old-epoch completion for the same job, execution, and publication.
It cannot use the old capability to dispatch another effect.

Old callbacks must fail authority checks without loss of the original result or attempt.
Renewal and takeover must preserve every deadline.

## Deadlines and stop obligations

Before process launch, each group deadline has null `launchedAt`, `deadlineAt`, and `launchReceiptId`.
The first observed launch supplies one deadline from `launchedAt + budgetMs`.
Receipt persistence time and reservation time do not start the clock.
Later launches retain that first deadline.
Langflow applies graph timeout transitions; Trellis records exact-attempt warnings and stops.

Trellis commits cancel intent, the reservation block, and required stop obligations before external stop calls.
Each obligation remains until the runtime proves that its exact attempt exited.
Engine cancellation alone cannot confirm a stop.
An unknown stop remains `ownership_unknown` across host restarts.
A stop for an old attempt cannot target a newer attempt.

## Failure and event replay

`FailureV1.kind` separates execution errors from review feedback.
Worker loss, launch failure, process error, timeout, and invalid execution are errors.
Human rejection and an exhausted loop are feedback.
Unknown authority, pending delivery, and cancellation remain separate states.
The existing repeat policy consumes this classification; this module grants no repeat authority.

The source event has no Trellis sequence.
Trellis locks the execution, compares the permanent source identity, and assigns its next sequence.
It writes the event and run projection in that same transaction.
Equal duplicates retain their original sequence, even after an epoch change.
Changed bytes under an existing event identity conflict.
Unauthorized old-epoch events cannot update the projection.

Replay returns contiguous milestones after `afterSeq`, or an explicit `gap` with a snapshot revision and cursor.
Readers fetch the authoritative snapshot after a gap and continue from its `snapshotLastSeq`.
Token output uses the existing native output channel and cannot enter these event payloads.

## Verification

Run `bun test --config apps/server/src/langflowContracts/fixtures/bunfig.toml apps/server/src/langflowContracts` from the repository root.
The fixture configuration omits the database preload because these tests use no database.
Run Biome on the TypeScript files under `apps/server/src/langflowContracts` from the repository root.
Run `bun run typecheck` from `apps/server`.
