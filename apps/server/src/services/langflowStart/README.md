# Permanent run admission

`reserve(ctx, tx, input, deps)` validates a start and writes its permanent receipt in the caller transaction.
`reconcile(ctx, input, deps)` recovers engine correlation and opens admission after the exact job association commits.
`databaseStore(ctx)` implements `StartStore` through the receipt queries.
`reserveStart(ctx, tx, input, {hostId})` supplies this store and the current publication service.
It returns `StartReservation`: `{execution: StartRun, disposition: "queued" | "reused"}`.
`StartRun` contains either a retained legacy record or the immutable Langflow reservation.
The composition service initializes the public projection in the reservation transaction.
After commit, it reads the public view in a new transaction.
The publication dependency uses the TRL-684 `requireCurrentPublication` service.
TRL-696 owns composition and route registration.

An actor and request UUID identify one permanent receipt.
Each validated request uses deterministic JSON field order.
The receipt compares those bytes and returns the original execution across terminal outcomes.
A request that reuses an existing run also needs its own permanent receipt.
The same-flow/diff lookup must include retained legacy runs at cutover.
Only the latest failed execution with failure kind `error` permits an automatic repeat.
Explicit repetition requires `allowRepeat` and a reason.
A new run requires the current publication and the current linked diff head.
The reviewed head does not select a worktree commit.
Native launch code retains ownership of current worktree selection and launch-time ticket context.

`submissionBytes` contains the exact immutable publication and snapshot payload bytes.
Their SHA256 is `SubmissionV1.submissionDigest`.
`EngineSubmission.envelopeBytes` carries the envelope; `payloadBytes` carries the publication and snapshot.
`submissionEnvelope` serializes the original version-1 envelope separately with closed admission.
A lost response cannot change the bytes of that envelope.
Only an authoritative absent lookup permits submission.
An unknown lookup preserves the reservation and blocks submission.
The engine transport returns `unknown` when it cannot establish the result of an external call.
A lookup or submission receipt must match the host, execution, publication, and payload digest.
The supervisor supplies the delivery authority for the exact job.

The store commits the correlation and authority with admission closed.
A separate transaction creates one admission receipt and its delivery obligation.
The engine receives that receipt after commit.
An early engine job must suspend at its durable barrier until it receives that receipt.
A pending or unknown delivery retains the receipt for recovery.
Recovery of open admission preserves its correlation, authority, receipt, native effects, completion receipts, and stop obligations.
Ownership transfer remains with the supervisor.
`ReconcileContext.log` uses `JobsLog` to identify unknown lookup, submission, and admission results.
These logs contain identifiers only.

## Host connection

`createStartConnection(options)` returns `committed({executionId})` and `recover()`, which return `Promise<void>`.
The host supplies one abort signal, its dispatch gate, receipt archive, supervisor, initial authority issuer, and authority lifecycle.
`database` calls the internal `langflowStart.state` service as the system actor.
That service checks the configured host and completes each database operation in its caller transaction.
The host invokes `committed` after a successful start mutation returns from the service transport.
The host invokes `recover` at startup and during its serialized recovery passes.

`createAdmissionEngine` uses `EngineClient` with the private token file for the observed engine instance.
It calls `/trellis-v1/admission/lookup`, `/submit`, and `/open`.
It retains the original authority text and the exact admission bytes from the outbox.
The engine must acknowledge the current grant before it receives admission.
An invalid response or a lost response keeps the dispatch permit pending.
The connection records a terminal archive receipt only after the admission acknowledgement commits.
A restart can finish permit settlement from that saved acknowledgement without another engine request.

`recover` reads retained permits and pages through the database reservations for the configured host.
The page size limits one database read, not the number of retained reservations.
The connection serializes its own deliveries and checks the host abort signal before new work.
A canceled reservation uses lookup only to recover its engine job.
Cancellation settlement requires terminal engine proof, confirmed native stops, and no pending native dispatch permit.
The authority lifecycle renews a bound grant or recovers a new owner before admission.
An archived grant can restore its original closed association while its owner remains active.
A different owner requires the atomic successor operation from the authority service.

## Store requirements

Each store method receives the caller transaction.
`readRequest` and `saveRequest` read and write the permanent actor/request receipt, including reused requests.
`saveRequest` rejects changed bytes and returns the first receipt after a concurrent insert.
`reserve` and `saveRequest` run in one transaction.
`latest` serializes under the flow lock and reads the stored failure category.
`bind` locks the execution and rejects a different correlation or an unauthorized owner change.
`markUnknown` never replaces a committed correlation, open admission, or terminal state.
`openAdmission` locks the execution and checks cancellation and current unexpired ownership.
It requires the committed job association and atomically saves one receipt with its delivery obligation.
A repeated call returns that receipt and preserves every dependent record.
`confirmAdmission` records an exact engine receipt and marks its delivery obligation complete.

## Retained verification gaps

The database adapter uses permanent aliases, closed-admission association, and durable delivery obligations.
Its database fixtures use the production migrations through `openTestDb`.
The legacy start route remains active.

`reserve/reserve.test.ts` uses the existing project, ticket, flow, and diff queries with an in-memory receipt store.
`reconcile/reconcile.test.ts` checks transaction order and recovery through simulated store and engine ports.
`databaseStore/databaseStore.test.ts` uses the actual receipt queries with migrated tables and a simulated engine.
`startConnection/startConnection.test.ts` mounts authenticated HTTP with the real database adapter, dispatch gate, receipt archive, and initial authority issuer.
Its HTTP server controls lost submission responses, lost admission acknowledgements, and unknown lookups.
The supervisor and authority lifecycle use fixture ports.
A gate fixture interrupts settlement after the database acknowledgement commits.
`admissionEngine/admissionEngine.test.ts` covers exact bytes and invalid or incomplete external responses.
These fixtures do not establish real-engine or installed-host proof.
The required commands run after the combined merge:

- `bun test apps/server/src/services/langflowStart/ --timeout 60000`
- `bun run --cwd apps/server typecheck`
- `./node_modules/.bin/biome check apps/server/src/services/langflowStart`

ENG-F1 and ENG-F22 require the actual engine, permanent ledger, durable barrier, and retained native effects.
ENG-F9 requires database-backed UUID replay after every terminal outcome and concurrent alias requests.
Installed-host acceptance remains separate from those checks.
