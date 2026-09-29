# Private human decision API

The domain router uses `/trellis-v1/decisions` at the application root.
Both routes require the private engine bearer token.
Acceptance also requires the exact saved authority bytes with `decision.deliver` permission for the execution and engine job.
Lookup uses transport authentication and retains access to the original receipt after authority expires.
`create_decision_router(*, security, execution_service)` returns the relative `/decisions` router.
Import this factory from `langflow.services.trellis_v1.decision_api`.
The shared router supplies the outer `/trellis-v1` prefix exactly once.

## Lookup

`POST /trellis-v1/decisions/lookup` takes `DecisionLookupRequestV1`:

```json
{
  "version": 1,
  "executionId": "execution-1",
  "engineJobId": "00000000-0000-4000-8000-000000000001",
  "engineRequestId": "human-request-1",
  "decisionId": "decision-1",
  "payloadDigest": "dcf169b7f9dd00e968f9e54c0c6799f724e97a36cac9046ba5b5834cccf60e3c"
}
```

HTTP 200 contains `DecisionLookupResultV1`.
The states are `accepted`, `absent`, `unknown`, and `conflict`.
An accepted result contains the original acceptance receipt.
An absent result contains the exact lookup and `authoritative: true`.
A conflict contains the exact lookup and `acceptedDigest`.
The client can submit the saved decision only after an authoritative absent result.

## Acceptance

`POST /trellis-v1/decisions/accept` takes:

```typescript
{
  decisionBytes: string;
  payloadDigest: string;
  authorityBytes: string;
}
```

`decisionBytes` contains the original UTF-8 JSON for `HumanDecisionReceiptV1`.
The digest covers those exact bytes.
`authorityBytes` contains the exact UTF-8 JSON bytes of the current saved `DeliveryAuthorityV1` grant.
The client must preserve its encoding.
The ledger locks the job and authority rows in its transaction before it accepts or replays a decision.
The authority control writer uses the same authority lock.
The host keeps its dispatch permit through the remote mutation.
The handler retains all notes and preserves a negative decision as feedback.
HTTP 200 contains the original `DecisionAcceptanceV1` receipt.
The ledger commits that receipt, its resume signal, and its enqueue obligation together.
The execution service consumes the obligation after that commit.

## Errors and recovery

HTTP 401 rejects absent or invalid private authentication.
HTTP 409 with `decision_authority_refused` rejects absent, expired, revoked, mismatched, or corrupt authority.
HTTP 409 rejects changed decision bytes or a human wait that is not pending.
HTTP 422 rejects an invalid request shape.
A 409 response does not establish acceptance.
A lost response leaves the client acknowledgement uncertain.
The client must use the same lookup identity to recover the original receipt.

## Assembly and proof

TRL-875 owns the shared private authentication module and current authority checks.
TRL-669 owns the execution service and graph continuation.
Its acceptance wrapper forwards the required `authority_bytes` argument unchanged.
Apply `0002-require-decision-authority.patch` after the existing ledger source and the shared authority module.
TRL-674 owns the patch series and the shared upstream assembly.
TRL-696 owns the Trellis HTTP client and route composition.

Route execution, authority races, and actual engine recovery require the combined fixture batch.
The host capacity constraint currently defers that batch and Review.
