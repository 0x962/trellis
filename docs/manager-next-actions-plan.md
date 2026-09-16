# Manager next actions

Status: capacity waits implemented; time, dependency, and human-response waits added in this branch, 2026-09-16. Research baseline: `23de0f70`.

The [manager guide](agents.md#manager-capacity-waits) describes the implemented API and CLI behavior.
Deployment and production measurements remain separate steps.

Create a durable queue for the next action on each ticket. Start with tickets that wait for worker capacity.
The intended outcome is less time between a free worker slot and the next useful assignment.
Navid should not need to remind the manager about work it already agreed to continue.

## Evidence at the research baseline

At `23de0f70`, the controller stores dispatch receipts, stable assignment identifiers, and per-ticket outcomes.
The following observations describe that revision, before the capacity-wait implementation:

- The [outcome contract](../packages/api/src/contract/controller.ts) stores a status, reason, and optional reference. It has no structured next action or wake condition.
- [handle](../apps/server/src/services/controller/work.ts) marks a dispatch as handled once every ticket has an outcome. A `queued` or `blocked` outcome counts toward that result.
- [workItems and coordination](../apps/server/src/services/controller/coordination.ts) exclude tickets with recorded outcomes and dispatches with handled work.
- The [blocked-outcome test](../apps/server/test/int/src/services/controller/work.test.ts) confirms that a blocked ticket leaves the unfinished list while other tickets remain.

A later heartbeat or ticket event can prompt the manager to inspect the board again.
These mechanisms do not record a durable instruction to revisit this ticket when capacity becomes available.
This finding concerns the research baseline, not the revision in the installed service.

## Why this comes first

The [research](research/persistent-agents.md) repeatedly identifies durable state and explicit continuation as mechanisms for work across sessions.
Trellis already supplies the delivery and recovery primitives that this change needs.
An explicit next action also provides a future place for quota reset times, dependencies, and human responses.

This is a priority judgment from the source and research. We have not measured which blocker costs Trellis the most time.
Account failover addresses one blocker category. Shared review batches need evidence about compatible changes and actual check costs.
Neither addresses this gap between an acknowledged message and a deferred action.

## First slice: capacity waits

1. Record the next action when the manager queues a ticket because worker capacity is full.
2. Store the ticket, responsible manager scope, action, capacity condition, lifecycle state, and stable assignment request identifier.
3. Save that action and acknowledge the dispatch in one transaction.
4. Surface eligible actions when capacity becomes available. Use the existing assignment rules to define available capacity.
5. Let the manager choose among eligible tickets with current priority and context.
6. Reuse the action's assignment identifier across delivery retries and manager replacement.
7. Retire the action after a confirmed assignment or an explicit cancellation.

Keep deferred actions separate from dispatch receipts. An acknowledged message can have work that remains outstanding.
Make due actions visible in manager context and through the CLI.
Keep the heartbeat as a reconciliation path when an event is missed.
Respect project scope, pause states, ticket deletion, and completed or superseded work before any assignment.
Preserve the existing manager conversation.

This slice does not add account rotation, automatic approval, review batches, or a new priority algorithm.
The [manager wait guide](agents.md#manager-waits-for-time-dependencies-and-responses) describes time and event conditions in the same model.
A deadline for a required human decision must never count as approval.

## Acceptance and measurement

Start with a failing integration test for this sequence:

1. Fill the project's worker capacity.
2. Record a queued outcome and acknowledge its dispatch.
3. Restart the controller and restore the persisted state.
4. Free a worker slot without a new comment on the queued ticket.
5. Observe one eligible action with the original assignment identifier.
6. Deliver it again and verify that it creates only one assignment.

Also test pause and resume, manager replacement, cancellation, and two actions that compete for one slot.
Use the existing assignment service as the authority for concurrency.

Record the time when an action becomes eligible and the time when its assignment starts.
Compare median and p95 delay before and after the change on the same capacity scenarios.
Count duplicate assignments, manager turns, and human reminders alongside elapsed time.
The release must preserve assignment uniqueness and pause behavior.
Production observations must establish the effect on completion time; this plan does not claim a measured gain.
