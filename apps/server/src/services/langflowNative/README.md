# Native attempts for Langflow

`reserveNativeRequest(ctx, tx, { requestBytes })` saves one flow attempt for an approved engine occurrence.
It locks the execution, checks the authenticated grant, and compares the original request bytes before it reserves an attempt.
The semantic identity includes the node, parent occurrence, phase, and full loop path.
Equal replay returns the saved handle and a null launch value.
Changed bytes fail with `identity_conflict`.

`NativeReservationCtx.resolveOccurrence` resolves configuration from the retained publication and the authenticated engine checkpoint.
The resolver validates the full occurrence, input receipts, deadline references, and specification hash.
It returns the exact task key, approved instruction, name, harness, and optional account.
Its request digest binds that approval to the original request bytes.
The private transport supplies `nativeAuthority` after authentication.
A capability ID in a request cannot authenticate the caller.

The reservation uses `agentRuns.reserve` with flow kind and `projectLaunchConfig`.
Those services retain the existing account selection and harness precedence.
The caller commits the reservation before it calls `dispatchNative`.
The launch value contains the attempt token and stays inside the trusted host.

`dispatchNative` claims the reserved handle once and calls `startNative` with that exact attempt.
Its `resolveProcessLimits` hook reads current deadlines and budgets inside the execution transaction.
Its `recordObservedLaunch` hook commits the runtime launch time and the corresponding group deadlines together.
TRL-692 owns both deadline hooks and the exact-attempt stop obligations.
An interrupted dispatch retains the same reservation for runtime inspection.
The caller uses `observeNativeAttempt` after a restart or an uncertain launch response.

`observeNativeAttempt` inspects the exact runtime attempt and reads the current Git commit from its saved workspace path.
An absent Git revision produces a null workspace commit. Other Git failures retain their original error.
`recordNativeObservation` attaches a late provider session only to the same current attempt.
It represents the workspace as `workspace:<agentRunId>`; `agent_runs.workspace_id` retains the local path.
Its required `recordWorkspace` hook stores the observed workspace commit in the same transaction.
The reviewed head remains part of the immutable execution record.

`observedCompletion` requires the exact attempt, provider session, initial prompt receipt, final result identity, and complete output.
The native runtime assigns an immutable result ID.
The bridge assigns version 1 to that result ID and rejects changed output under the same identity.
It commits the accepted result and completion outbox together.
Results that arrive after cancellation remain available for audit.
`readCompletionDelivery` checks current authority and rejects a canceled execution.
It returns the original result bytes separately so the private transport can preserve their digest.

## Integration and proof

TRL-684 and TRL-696 supply publication validation and the authenticated checkpoint resolver.
TRL-689 supplies the durable observation of the workspace commit.
TRL-692 supplies deadline effects and cancellation during dispatch.
TRL-696 owns private route composition, restart observation, and delivery of pending completions.

The database fixtures cover replay, changed bytes, forged grants, late sessions, complete output, rollback, and canceled delivery.
The observer fixtures cover exact attempts, prompt receipts, unknown ownership, and conflicting final output.
The integrated batch must prove the production resolver, one real process per occurrence, retained conversations, and cancellation during launch.
ENG-F3, ENG-F4, and ENG-F21 remain open until that integrated proof passes.

Run these checks on the merged batch:

```sh
bun test --config apps/server/src/langflowContracts/fixtures/bunfig.toml apps/server/src/services/langflowNative
bunx --no-install biome check apps/server/src/services/langflowNative
cd apps/server
bun run typecheck
```
