# Human decision acceptance probe

The patch targets Langflow v1.12.3 at `fec71dca901949c09ed4d63315804337cd2eb13d`.

Patch SHA-256: `bf8b044614d06ef67a260db1befbe11d77891555c510581c1f0d51fb54b6b0ef`.

The fixture imports the patched Langflow module from the pinned source tree. It uses the final TRL-666 receipt fields from `6246fcca805f6e5390f26b7924e28f27f7de0409`.

## Shared payload contract

The unchanged TRL-666 checkpoint uses `human-wait-1` as `ExternalWaitV1.waitId`. The checkpoint map uses this value as its key.

The unchanged `HumanWaitV1` uses `human-request-1` as `engineRequestId`. The decision ledger uses this value as the human decision key. The two values stay distinct.

The `HUMAN_INPUT_REQUIRED_EVENT` payload stores `request_id: human-request-1`. Its `trellis_wait_v1` field stores the unchanged `HumanWaitV1` object.

The `RESUME` signal stores `kind`, `engineRequestId`, `decisionId`, `enqueueObligationId`, and the exact decision object. A checkpoint lookup can use an `ExternalWaitV1.waitId`. Decision continuation matches `request.engineRequestId` inside the saved `ExternalWaitV1` bytes.

The resume consumer returns `request_id` from `request_id` or `engineRequestId`. It retains the exact decision for graph resume. Langflow selects the successors from the saved checkpoint.

TRL-669 owns `src/backend/base/langflow/services/background_execution/runner.py` event production and resume consumption. It also owns `JobService.consume_suspended_continuation` in `src/backend/base/langflow/services/jobs/service.py`. It owns `src/backend/base/langflow/services/trellis_v1/external_waits.py`.

TRL-670 owns `src/backend/base/langflow/services/trellis_v1/decisions.py`. Its ledger API is `accept`, `lookup`, `pending_enqueue_obligations`, and `mark_enqueue_obligation_consumed`.

```python
accept(*, engine_job_id: UUID, decision_bytes: bytes, payload_digest: str, authority_bytes: bytes, fault: FaultHook | None = None) -> dict[str, Any]
lookup(*, execution_id: str, engine_job_id: UUID, engine_request_id: str, decision_id: str, payload_digest: str) -> dict[str, Any]
pending_enqueue_obligations() -> list[dict[str, Any]]
mark_enqueue_obligation_consumed(
    *,
    engine_job_id: UUID,
    engine_request_id: str,
    decision_id: str,
    signal_id: UUID,
    enqueue_obligation_id: UUID,
    continuation_receipt_bytes: bytes,
) -> None
```

`accept` commits the acceptance row, serialized acceptance receipt, exact `RESUME` signal, and pending enqueue obligation in one real Langflow transaction. Replay and lookup return the saved acceptance receipt after that transaction commits.

TRL-669 consumes the obligation in a later transaction. Its dispatch result is `dispatched`, `execution_proven`, `pending_lease`, or `cancelled`. The consumer calls `mark_enqueue_obligation_consumed` only for `dispatched` or `execution_proven`.

The `dispatched` result requires a durable dispatch marker with the exact continuation receipt bytes. The `execution_proven` result requires the saved signal identity and a durable runner fact.

The mark reads the matching `trellis-continuation-v1` checkpoint and compares its UTF-8 bytes and identities before it records consumption.

The `pending_lease` and `cancelled` results keep the obligation pending. `BackgroundExecutionService` owns one retry at lease expiry and cancels its retry tasks when the service stops.

TRL-669 owns `accept_trellis_human_decision`, `_consume_trellis_decision_obligation`, and `_drain_trellis_decision_obligations` in `BackgroundExecutionService`. It owns the startup drain call and the sole executor queue path. TRL-674 owns the final combined patch series.

TRL-669 also owns `BackgroundExecutionService.lookup_trellis_human_decision`. That wrapper passes the exact lookup fields to `DecisionAcceptanceLedger.lookup` and returns the ledger result unchanged.

## Current authority

The source assembly includes the shared engine authority module and the decision API patches under `patches/engineApi/`.
`authority_probe.seed_authority` commits one current grant through `commit_authority` in the fixture transaction.
`stored_authority` reads the exact saved bytes through `read_authority(...).binding.authority_bytes`.
The subprocesses read this saved grant before they call the acceptance service.
The ledger checks this grant inside its transaction before it writes a decision.

The lookup fixture revokes the grant after acceptance.
It requires acceptance replay to fail and exact receipt lookup to succeed.
The separate authority refusal fixtures set `with_authority=False` before they prepare their explicit grant state.

Run this command from the Trellis repository after the combined source assembly:

```sh
PYTHONDONTWRITEBYTECODE=1 \
PYTHONPATH="$LANGFLOW_SOURCE/src/backend/base:$LANGFLOW_SOURCE/src/lfx/src" \
"$LANGFLOW_VENV/bin/python" -m pytest -q \
-c "$LANGFLOW_SOURCE/pyproject.toml" \
integrations/langflow/tests/decisions/test_decision_acceptance.py \
integrations/langflow/tests/decisions/test_decision_obligation.py
```

The test kills a child process after each flushed row and after the transaction commit. It verifies rollback, equal replay, changed-byte conflict, stale-wait rejection, exact lookup, and the durable drain marker.

The standalone test does not consume the queue obligation.

Run the composed ENG-F20 fixture in its own pytest process after the immutable TRL-669 patch and component are present:

```sh
PYTHONDONTWRITEBYTECODE=1 \
LANGFLOW_SOURCE_ROOT="$LANGFLOW_SOURCE" \
TRELLIS_669_ROOT="$TRELLIS_669_ROOT" \
PYTHONPATH="$LANGFLOW_SOURCE/src/backend/base:$LANGFLOW_SOURCE/src/lfx/src" \
"$LANGFLOW_VENV/bin/python" -m pytest -q \
-c "$LANGFLOW_SOURCE/pyproject.toml" \
integrations/langflow/tests/decisions/test_decision_continuation.py
```

The separate process lets Langflow finish its migrations before the fixture registers the feasibility tables. The fixture then creates those tables on the same real database engine.

The composed fixture uses `BackgroundExecutionService.accept_trellis_human_decision` and its lookup wrapper. It recovers through `sweep_orphans_on_startup`, the queue lease, the in-process executor, and `JobRunner`.

The fixture kills a process after acceptance commits. It also kills before the continuation receipt and after the queue lease commits.

The restarted service sees the unexpired lease. It keeps the obligation pending and uses one Langflow-owned retry at lease expiry.

The fixture then kills after dispatch and after the obligation mark. Progress needs no second boot or human submission.

The restarted source calls `resume_graph_with_decision` and `Graph.process`. `TrellisExternalWaitComponent` clears the saved wait before Langflow runs one successor.
