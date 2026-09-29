# Native cancellation and deadline effects

`cancelExecution(ctx, tx, input)` requires a human actor and the current public view revision.
The service checks that revision under the execution lock.
The saved intent uses the separate storage revision.
The caller commits its transaction before it calls `drainStops`.
Cancellation records its intent, the reservation block, exact-attempt stops, and the engine notification in one transaction.
The result exposes `needsStop` independently from the cancellation intent.
The run projection must preserve this distinction.

`assertExecutionActive(ctx, tx, { executionId })` locks the execution and rejects canceled work.
New reservations, launches, human decisions, and completion delivery require this guard or the equivalent storage guard.
An existing equal request can return its saved receipt.
A late result remains an audit record.
The storage query for pending deliveries returns only cancellation notifications after cancellation.

`drainStops(ctx, input, host)` reads committed obligations before each external stop.
It always sends the stored `attemptId` to `HarnessHost.stop`.
It never resolves the current attempt from the agent assignment.
A missing process record, runtime failure, or different attempt preserves `ownership_unknown`.
Only an exited response for the stored attempt with `endedAt` confirms the obligation.
The service logs a failed stop and keeps its obligation for the next reconciliation.
A later unconfirmed response cannot replace an existing confirmation.

# Clock composition

The engine supplies group occurrence identities and user budgets through `recordDeadline` before native reservation.
Each initial deadline has null launch and deadline timestamps.
The native bridge saves its observed launch receipt and calls `recordLaunchClocks` in the same transaction.
`recordLaunchClocks` reads the stored launch receipt and the request's group references.
The first launch observation starts each group clock from `launchedAt + budgetMs`.
Subsequent launches and host restarts preserve the saved deadline.
Nested groups retain their separate clocks; the earliest ancestor deadline controls native effects.

The host calls `recordExpiredStops` in a transaction before it drains stops.
This service records native stop obligations when a group deadline expires.
Langflow owns graph timeout transitions and successor selection.
The host must continue this reconciliation while the engine is unavailable.

The host calls `sendWarnings` outside a database transaction.
Warnings require the exact initial prompt receipt.
The half and quarter thresholds use the earliest group deadline.
Each warning has a deterministic message ID and stable text with an absolute deadline.
The service saves the warning before it calls `HarnessHost.sendAtTurnBoundary`.
The runtime preserves that ID before it writes input and refuses to repeat an uncertain write.
A confirmed runtime prompt receipt confirms the saved warning.
Each failed runtime read or send retains its warning and records the error.
Other attempts still receive their warnings.
Pending warnings use pagination, so the batch size does not restrict access.

TRL-696 owns route selection and host lifecycle registration.
The existing legacy cancel route remains separate until that composition.
TRL-688 owns launch and completion callers.
TRL-691 owns human decision callers.
TRL-689 owns the canceled projection and its stop warning.
The modules do not authorize production activation.

`cancelView(ctx, tx, input)` records cancellation and returns the saved public view in one transaction.
The public view retains pending stops while its status is canceled.
`drainStops` requires `ctx.core` and saves public stop confirmations in its update transaction.

`withAttemptOperation(home, attemptId, action)` serializes runtime submission and stop confirmation for one attempt.
The launch caller holds it across its final authorization check and runtime submission.
The stop caller holds it through the saved exit receipt.
Cancellation intent commits independently, so a queued launch sees it before submission.

`readStopReconciliation(ctx, tx, { dataHomeId, blockId, generation })` reads every execution, including canceled executions.
It returns exact obligations, launch receipts, and clocks as canonical bytes and a digest receipt.
The trusted restore caller verifies the data home and closes dispatch before it reads this snapshot.
It must retain the returned bytes in its durable restore receipt before it admits dispatch.
A nonempty `unconfirmed` list does not prove stop completion.
This read changes no clock or deadline.
