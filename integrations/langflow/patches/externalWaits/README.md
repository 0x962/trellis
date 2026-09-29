# Durable external waits

This patch targets Langflow v1.12.3 at `fec71dca901949c09ed4d63315804337cd2eb13d`.
It adds a graph-owned wait hook and preserves its wait set in the existing graph checkpoint.
The hook suspends the Langflow job and releases its worker.
Langflow continues to select successors, joins, branches, and loop work.

The patch uses the exact version 1 bytes from `apps/server/src/langflowContracts` at `6246fcca805f6e5390f26b7924e28f27f7de0409`.
It stores each wait before it calls Trellis.
It stores each completion delivery and receipt under the wait identity.
An equal duplicate returns the stored receipt.
A changed delivery for the same wait identity fails.

`TrellisExternalWaitBroker.delivery_for(graph, wait_bytes)` returns the exact saved `CompletionDeliveryV1` bytes.
It returns `None` when the wait has no completion.
It rejects a saved envelope when its exact `ExternalWaitV1` bytes differ from `wait_bytes`.
The component caller reads `delivery.result` as the accepted `NativeResultV1`.
This method does not create a request, reserve a handle, schedule work, or add another wait store.

`TrellisExternalWaitBroker.save_completion` receives the current durable authority epoch.
It accepts a native completion only when these values match the saved wait:

- the execution, publication, job, and launch epoch;
- the step, agent run, and attempt;
- the current authority epoch and `completion.deliver` permission;
- the receipt execution, job, completion, and result digest.

The caller reads the current authority epoch from the durable correlation row in the same completion transaction.

The graph checkpoint preserves all pending wait bytes.
A vertex rethrows `ExternalWaitPending` without converting it to `ComponentBuildError`.
A worker restart restores the same wait set and reruns only the unfinished vertices.
The existing graph queue then releases successors after those vertices finish.

## Human continuation handoff

The version 1 identities remain distinct:

- `ExternalWaitV1.waitId` is the graph checkpoint key. The published fixture value is `human-wait-1`.
- `HumanWaitV1.engineRequestId` is the decision request key. The published fixture value is `human-request-1`.
- `JobEvent.payload.trellis_wait_v1` holds the unchanged `HumanWaitV1` object.
- `JobEvent.payload.request_id` equals `HumanWaitV1.engineRequestId` for the existing Langflow human event reader.
- The `RESUME` signal holds `kind`, `engineRequestId`, `decisionId`, `enqueueObligationId`, and `decision`.
- The checkpoint lookup first accepts a wait key. It otherwise matches `request.engineRequestId` inside the saved wait bytes.
- The resumed result sets `request_id` from `request_id` or `engineRequestId` and retains the saved `decision`.
- The build resume path stores that decision in `graph.human_input_decisions[engineRequestId]`.
- `TrellisExternalWaitComponent` returns the saved decision for a human wait before it checks the native completion store.

TRL-670 calls this source interface after its acceptance transaction commits:

```python
async def consume_decision_continuation(
    self,
    *,
    engine_job_id: UUID,
    engine_request_id: str,
    decision_id: str,
    signal_id: UUID,
    enqueue_obligation_id: UUID,
) -> ContinuationConsumptionReceipt
```

The job transaction stores one immutable receipt per `enqueue_obligation_id`.
An equal replay returns the same receipt.
A changed replay fails with `continuation_obligation_conflict`.
The transaction conditionally changes `SUSPENDED` to `QUEUED`.
Concurrent external completions can share that queue claim without losing either completion.

TRL-668 uses this session-aware interface for the atomic admission boundary:

```python
async def consume_suspended_continuation_in_session(
	self,
	session: AsyncSession,
	*,
	engine_job_id: UUID,
	engine_request_id: str,
	decision_id: str | None,
	signal_id: UUID,
	enqueue_obligation_id: UUID,
) -> bytes | None
```

The caller supplies its active transaction after it writes the receipt, RESUME signal, and obligation.
The method flushes that session and claims the saved continuation.
It stores the immutable continuation receipt in the same transaction.
It does not commit, consume the signal, enqueue the executor, or schedule graph work.

TRL-668 exposes this admission dispatch boundary:

```python
@dataclass(frozen=True)
class AdmissionEnqueueObligation:
	engine_job_id: UUID
	engine_request_id: str
	signal_id: UUID
	enqueue_obligation_id: UUID
	continuation_receipt_bytes: bytes

async def pending_trellis_admission_obligations(self) -> list[AdmissionEnqueueObligation]

async def mark_trellis_admission_obligation_consumed(
	self,
	*,
	engine_job_id: UUID,
	engine_request_id: str,
	signal_id: UUID,
	enqueue_obligation_id: UUID,
	continuation_receipt_bytes: bytes,
) -> None
```

TRL-670 owns the decision ledger.
Its mark method receives the engine job, engine request, decision, signal, obligation, and exact continuation receipt bytes.
TRL-669 owns both service consumers, both drains, retained decision lookup, startup recovery, and the sole queue path.

The queue helper returns one `DispatchDisposition`:

```python
DispatchDisposition = Literal["dispatched", "execution_proven", "pending_lease", "cancelled"]

async def _enqueue_queued_continuation(
	self,
	*,
	engine_job_id: UUID,
	enqueue_obligation_id: UUID,
	continuation_receipt_bytes: bytes,
) -> DispatchDisposition
```

- `dispatched`: the executor accepted the job, and the service stored the exact receipt under `trellis-dispatch-v1:<enqueueObligationId>`;
- `execution_proven`: the durable job state binds the exact continuation signal to the runner;
- `pending_lease`: a fresh QUEUED lease blocked dispatch;
- `cancelled`: the job is canceled while the exact continuation signal remains unconsumed.

A QUEUED row, lease, or continuation receipt does not prove execution.
The helper first reloads `trellis-continuation-v1:<enqueueObligationId>` and compares its exact bytes.
An IN_PROGRESS row proves execution only when `job_metadata.continuation_signal_id` matches the receipt signal.
A consumed exact signal also proves execution.
A later SUSPENDED row proves execution only when the exact prior wait is absent from the current graph checkpoint.

The service marks an admission or decision obligation only for `dispatched` or `execution_proven`.
It leaves the obligation pending for a fresh lease.
It schedules one deduplicated retry after the lease expires.
The retry uses the same Langflow queue path.
The service cancels and awaits its retry tasks during `stop`.

The startup queue sweep uses the same retry mechanism for every fresh QUEUED lease.
This includes a crash after executor submission and obligation consumption but before the runner claim.
The recovery does not depend on a pending Trellis obligation.

## Engine API transaction handoff

Apply `0002-queue-bootstrap-and-completion-transactions.patch` after the durable wait patch.
It adds this initial dispatch interface:

```python
async def enqueue_trellis_submission(
	self,
	*,
	engine_job_id: UUID,
	flow_id: UUID,
	user_id: UUID,
	request_bytes: bytes,
) -> DispatchDisposition
```

The job and correlation must exist before this call.
The method binds the exact build request to the existing job.
It uses the existing Langflow executor and lease path.
An equal replay returns `dispatched` or `execution_proven`.
A changed job binding, request, or dispatch digest fails.
A fresh foreign lease returns `pending_lease` and schedules one existing lease retry.

The patch also adds this caller transaction interface:

```python
async def save_checkpoint_once_in_session(
	self,
	session: AsyncSession,
	job_id: UUID,
	kind: str,
	blob: str,
) -> str

async def save_completion_in_session(
	self,
	session: AsyncSession,
	*,
	job_id: UUID,
	authority_epoch: int,
	wait_bytes: bytes,
	delivery_bytes: bytes,
	receipt_bytes: bytes,
) -> bytes
```

The native completion ledger calls `save_completion_in_session` inside its locked job transaction.
The same transaction writes the exact RESUME signal and the pending dispatch obligation.
The helper writes no signal, obligation, queue claim, or commit.
The service consumes the obligation after the caller commits.

The occurrence producer stores exact native request bytes under `trellis-native-request-v1:<sha256(waitId)>`.
The completion ledger compares the delivery request digest with those saved bytes.
The completion envelope does not reconstruct request bytes from its parsed request object.

TRL-674 owns the combined patch series.

The probe uses these cases without a product ceiling:

- 501 nodes;
- 2,001 edges;
- 51 loop rounds;
- a 1,441-minute user deadline.

Run this fixture command after Root merges the complete Langflow source set:

```sh
python -m pytest -q -c "$LANGFLOW_SOURCE_ROOT/pyproject.toml" "$TRELLIS_ROOT/integrations/langflow/tests/semantics"
```

Run the exact delivery boundary with this focused target:

```sh
python -m pytest -q -c "$LANGFLOW_SOURCE_ROOT/pyproject.toml" "$TRELLIS_ROOT/integrations/langflow/tests/semantics/test_completion_replay.py"
```

The fixture requires these variables:

- `TRELLIS_ROOT`: the Trellis worktree with the final TRL-666 source;
- `LANGFLOW_SOURCE_ROOT`: the pinned Langflow source root;
- `LANGFLOW_RUN_ROOT`: a private directory for the fixture database and logs.

The fixture does not install dependencies or start a server.
No fixture, build, engine probe, or Review flow ran for this source publication.
The retained ce71 and 23ec candidates are rejected evidence because they can consume an obligation after a fresh lease blocks dispatch.
