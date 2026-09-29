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
`resolveNativeLimits` reads retained group clocks, and `recordNativeLaunch` saves the runtime launch receipt and starts those clocks.
Both hooks receive the caller transaction.
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

## Private transport and recovery

`requestNativeAttempt(ctx, { requestBytes }, dependencies)` commits the reservation before dispatch.
The authenticated private route supplies the authority and immutable occurrence resolver.
TRL-669 owns runtime occurrence data, and TRL-696 owns the route and publication resolver.
The private route is `POST /api/langflow-private/v1/native-reservations`.
Its UTF8 request body contains exact `NativeRequestV1` bytes, and its response contains `NativeHandleV1`.

Reservation and launch each acquire a durable permit from `DispatchGate` before their first write.
Reservation settlement uses the committed step ID. Launch settlement uses the saved launch receipt ID.
The gate uses its trusted receipt reader to verify settlement.
An uncertain effect keeps its permit pending for reconciliation.
The launch holds `withAttemptOperation` through preparation, authorization, runtime submission, and the native row update.
Stop confirmation holds the same lock for that exact attempt.

`dispatchNative` accepts the existing `startNative` dependencies as its third argument.
`observeNativeAttempt` accepts an exact runtime inspection client as its third argument.
The production defaults use the existing native runtime.
The observation transaction also repairs a missing launch receipt from the exact runtime observation.

Before reservation commit, the bridge writes an owner-only snapshot in `harness-attempts/<attemptId>/langflow-launch.json`.
The snapshot retains the original launch token, selected configuration, and instruction.
It contains neither the ambient environment nor account credentials.
The database stores the exact snapshot digest with the reservation.
The file and database are separate stores. A rollback can leave an orphan file.
Only a committed reservation can authorize recovery.

`recoverNativeAttempt` checks the snapshot digest, token hash, generation, current attempt, and immutable launch configuration.
Only the reserved state can proceed through normal dispatch guards.
Other states require observation of the original attempt.
Missing snapshots and historical null digests refuse recovery.
The snapshot never supplies launch authority or a replacement attempt.

`readNativeOutput` reads exact retained completion bytes after the current native attempt changes.
The caller authorizes the execution read. Historical reads require no delivery grant.
Every execution, step, run, attempt, and result identity must match.

`readNativeSnapshotManifest` verifies committed snapshots and returns paths, hashes, and exact bindings for a trusted external archive.
`readLaunchSnapshot` reads their private bytes without mutation.
Missing, unsafe, or corrupt files and historical null digests appear in `unavailable` with their exact bindings and reasons.
Unexpected I/O failures propagate to the archive caller.
Paired backup and restore must include these files and retain the dispatch block until their validation succeeds.
The ordinary database backup does not contain the private launch files.
