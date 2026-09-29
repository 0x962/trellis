# Permanent correlation patch

Base: Langflow v1.12.3 at `fec71dca901949c09ed4d63315804337cd2eb13d`.
Tree: `e6ac634257b30645b6c35bcc707ed271789877d6`.
Contract source: TRL-666 at `678f245448b523c8f7a9727d013dedfe2f6c280c`.

The patch adds `langflow.services.trellis_v1.correlation`.
The module consumes the exact `SubmissionV1`, `CorrelationReceiptV1`, and `AdmissionReceiptV1` bytes.
It retains the first bytes and returns the first receipt for an equal request.
It refuses changed bytes and an unknown lookup.
It raises `AdmissionPending` with the exact `ExternalWaitV1` bytes while admission stays closed.
The generic wait patch must save that wait as a graph checkpoint and release the worker.

The combined patch needs these upstream calls:

1. `BackgroundExecutionService.submit` calls `accept_submission` before it queues the job or returns the response.
2. A real `CorrelationStore.reserve` transaction commits the `Job`, the correlation row, and the durable queue marker.
3. The first native-effect path calls `admission_or_wait` with exact admission-wait bytes before it sends a native request.
4. The admission route calls `open_admission` with the exact receipt bytes.
5. The generic wait consumer commits receipt consumption and the continuation obligation in one transaction.

`CorrelationStore.commit_admission` rejects a canceled execution and a revoked owner.
Recovery retains native effects and exact-attempt stop obligations after admission.
The store keeps correlations through completed, failed, canceled, and timed-out jobs.
Only an authoritative absent lookup permits a new job.

Langflow remains the sole owner of successors, joins, branches, and loop rounds.
This patch adds no graph schedule code and no app payload ceiling.
The source fixture uses a fake store, so it cannot prove the transaction or worker boundary.
TRL-667 owns the only pinned source and the serial real-engine run.
