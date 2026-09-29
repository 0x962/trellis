# Permanent correlation patch

Base: Langflow v1.12.3 at `fec71dca901949c09ed4d63315804337cd2eb13d`.
Tree: `e6ac634257b30645b6c35bcc707ed271789877d6`.
Contract source: TRL-666 at `6246fcca805f6e5390f26b7924e28f27f7de0409`.

The patch adds `langflow.services.trellis_v1.correlation`.
The module consumes the exact `SubmissionV1`, `CorrelationReceiptV1`, and `AdmissionReceiptV1` bytes.
It retains the first bytes and returns the first receipt for an equal request.
It refuses changed bytes and an unknown lookup.
It raises `AdmissionPending` with the exact `ExternalWaitV1` bytes while admission stays closed.
The generic wait patch must save that wait as a graph checkpoint and release the worker.

The patch adds `TrellisJobCorrelation` and `JobServiceCorrelationStore`.
The composite primary key is `(actor kind, actor name, request UUID)`.
The unique engine correlation key is `(host ID, execution ID)`.
The engine job ID is unique.
The engine session ID is unique because one session cannot serve two executions.
`JobService.reserve_trellis_correlation` inserts the queued job and correlation row in one transaction.
A unique-key race reads the winning permanent row.
Terminal job states do not remove the correlation.
`JobService.commit_trellis_admission` requires the exact saved wait and a suspended job.
It writes the admission receipt, resume signal, and local enqueue obligation in one transaction.
It calls the TRL-669 in-session continuation helper before that transaction commits.
The helper owns the only suspended-to-queued compare-and-set.
The admission transaction saves the immutable continuation receipt and leaves its local obligation pending.
`JobService.pending_trellis_admission_obligations` returns every pending admission dispatch without an item limit.
`JobService.mark_trellis_admission_obligation_consumed` requires the exact job, request, signal, obligation, and continuation receipt bytes.
It marks the obligation only after TRL-669 proves dispatch or prior execution.

The shared `JobService` hunk has this ownership split:

1. TRL-668 adds the runtime `cast` import and type-only correlation imports.
2. TRL-668 adds correlation methods immediately after `create_job`.
3. TRL-669 adds `json` and `ExternalWaitPending` imports.
4. TRL-669 adds checkpoint and continuation methods after `save_checkpoint`.
5. TRL-669 adds `ExternalWaitPending` to the `run_coro` pause tuple.
6. TRL-669 extracts `consume_suspended_continuation_in_session` from its public wrapper.
7. TRL-669 owns the common post-commit dispatch result and recovery drain.

TRL-668 does not edit TRL-669 methods or anchors.
TRL-674 must regenerate the combined shared-file hunks from the clean pinned source.
The combined source uses the exact shared dispatch contract from TRL-669.

`BackgroundExecutionService._enqueue_queued_continuation` takes the exact job, obligation, and continuation receipt bytes.
It returns `dispatched`, `execution_proven`, `pending_lease`, or `cancelled`.
The service first compares the stored continuation receipt with the supplied bytes.
The service marks an admission obligation only for `dispatched` or `execution_proven`.
A fresh foreign lease keeps the obligation pending and schedules one retry for its expiry.
Cancellation does not prove execution and does not consume the admission obligation.
Startup queue recovery schedules the same retry after a crash that follows executor acceptance and obligation consumption.
The service cancels and awaits those retry tasks when it stops.

The combined patch needs these upstream calls:

1. `BackgroundExecutionService.submit` calls `accept_submission` before it queues the job or returns the response.
2. `JobServiceCorrelationStore.reserve` commits the `Job`, the correlation row, and the queued status.
3. The first native-effect path calls `admission_or_wait` with exact admission-wait bytes before it sends a native request.
4. The admission route calls `open_admission` with the exact receipt bytes.
5. The generic wait consumer commits receipt consumption and the continuation obligation in one transaction.
6. The background service drains pending admission obligations after startup.

The first admission commit rejects a job that is not suspended at its saved wait.
TRL-671 owns the engine-owner check in the combined series.
Recovery retains native effects and exact-attempt stop obligations after admission.
The store keeps correlations through completed, failed, canceled, and timed-out jobs.
Only an authoritative absent lookup permits a new job.

Langflow remains the sole owner of successors, joins, branches, and loop rounds.
This patch adds no graph schedule code and no app payload ceiling.
The pure fixture uses a fake store.
The composed fixture uses the real `JobService`, SQLite transaction, graph checkpoint, and `JobRunner` suspension path.
The composed fixture creates its feasibility table in its private database.
A production migration does not belong to this source-only fragment.
The early composition adds the authorized in-session continuation seam.
TRL-668 does not add a second queue writer or executor path.
Integrated verification runs after the complete Langflow merge.
