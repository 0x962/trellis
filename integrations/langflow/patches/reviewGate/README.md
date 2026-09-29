# Jev review visits

The private Trellis route calls the durable classification service. The engine journal retains each review visit before the HTTP request.

`POST /api/langflow-private/v1/review-gates/context` returns the canonical classification request from the locked Trellis execution. Its input contains `version`, the engine job fields, and `classificationRequestId`. The common envelope contains `requestBytes` and the original `authorityBytes`.

`POST /api/langflow-private/v1/review-gates` accepts the exact `ReviewClassificationVisitV1` bytes in that envelope. The response uses `ReviewClassificationResponseV1`. A visit identifies one occurrence. The classification request identifies the shared result for the execution.

Both routes require the current engine instance bearer and `X-Trellis-Capability-Id`. Mount them after the Host guard and before global host authentication. The supervisor callback covers the authority checks, occurrence lookup, claim, and permit acquisition. The provider call runs after that callback and outside a database transaction.

The original claimant settles the classification permit only after a validated provider response and a committed terminal receipt. A thrown classifier error retains the permit. A replay cannot settle that permit. An interrupted receipt does not prove that the provider stopped.

`reviewGateEngine(client, signal)` supplies `resolveOccurrence` and `accept` for `ReviewGateInvocationCtx`. The context also supplies `withAuthenticatedEngine`, `control`, `newTx`, `now`, and `log`. The route factory is `langflowReviewGate({context})`.

The Python factory `create_review_gate_router(jobs=..., executor=..., security=...)` supplies the `/review-classifications/visits` and `/review-classifications/accept` routes. Mount that router under `/trellis-v1`. The accept route calls the TRL-995 ledger and its continuation consumer after the ledger transaction.

Call `install_review_gate_transport(origin=..., authentication_file=...)` with the Trellis origin and current engine instance credential file. This transport serves the review component. It uses the shared authority records for each request.

The component is `integrations.langflow.components.jevGate.jevGate.TrellisReviewGateV1`. It reads `trellisReviewGatesV1` from the retained publication. Its `yes` and `no` outputs use Langflow branch exclusion. The catalog owner controls its publication qualification.

`run_review_visit` uses the existing occurrence journal. `classificationRequestId`, `classificationRequestBytes`, and `reviewVisits` share that journal with the native and human records. The native and human `visits` entries retain their own namespace. The operation uses `locked_graph`, `save_journal`, `save_wait`, and `apply_waits` from TRL-1006.

Each review record stores `requestBytes`, `waitBytes`, and `acceptedResultId`. The operation sets `acceptedResultId` to the classification receipt ID after it reads the accepted terminal result from the TRL-995 ledger. `acceptedResultBytes` retains those exact bytes. `outputReceiptId` identifies the output on the selected branch.

The host delivers one response for each saved review wait. The same classification receipt serves all these responses. A later visit can reuse that result. Each delivery has an `engine-delivery` permit. An unknown response retains that permit for exact replay. A claimed result never enters the acceptance route.

## Source assembly

Apply `0001-review-gate-invocation.patch` after the TRL-995 review protocol and the TRL-1006 occurrence primitives. Copy the component directory with the existing component package. The assembly owner controls the shared patch series. The composition owner controls route and transport registration.

## Deferred verification

The source includes mounted HTTP fixtures with the real Trellis database and deterministic classifier responses. The Python fixtures cover the shared journal identity and branch selection in a real Langflow graph. The graph fixture substitutes the provider operation; it does not prove the complete HTTP lifecycle.

After the combined merge, run the focused server fixtures with the repository test command, the server type check, and Biome for the changed TypeScript files. In the existing patched engine environment, run `pytest integrations/langflow/tests/reviewGate` and the TRL-995 continuation fixtures. Complete the combined route, restart, and cancellation proof there.

This source publication runs no tests, linters, builds, installs, engine execution, or provider calls. Runtime acceptance remains with the merged batch.
