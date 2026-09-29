from __future__ import annotations

import json
import os
from dataclasses import replace
from pathlib import Path
from uuid import UUID

import pytest

from langflow.services.trellis_v1.correlation import (
    AdmissionPending,
    CorrelationCoordinator,
    CorrelationKey,
    CorrelationUnknown,
    LookupResult,
    ProtocolConflict,
    StoredCorrelation,
)

CONTRACT_ROOT = Path(
    os.environ.get(
        "TRELLIS_LANGFLOW_CONTRACT_FIXTURES",
        Path(__file__).parents[4] / "apps/server/src/langflowContracts/fixtures",
    )
)


def contract_bytes(name: str) -> bytes:
    return (CONTRACT_ROOT / f"{name}.json").read_bytes()


def reserved_submission_bytes() -> bytes:
    submission = json.loads(contract_bytes("submission"))
    submission["state"] = "reserved"
    submission["correlation"] = None
    submission["admission"] = {"state": "closed", "barrierId": "barrier-1"}
    return json.dumps(submission, separators=(",", ":")).encode()


def admission_wait_bytes() -> bytes:
    return b'{"kind":"admission","waitId":"admission-wait-1","barrierId":"barrier-1"}'


class MemoryStore:
    def __init__(self) -> None:
        self.records: dict[CorrelationKey, StoredCorrelation] = {}
        self.unknown = False
        self.effects = 0

    async def lookup(self, key: CorrelationKey) -> LookupResult:
        if self.unknown:
            return LookupResult(state="unknown")
        record = self.records.get(key)
        return (
            LookupResult(state="found", record=record)
            if record
            else LookupResult(state="absent")
        )

    async def reserve(self, candidate: StoredCorrelation) -> StoredCorrelation:
        record = self.records.setdefault(candidate.key, candidate)
        return record

    async def commit_admission(
        self, candidate: StoredCorrelation, admission_bytes: bytes
    ) -> StoredCorrelation:
        record = self.records[candidate.key]
        if record.admission_receipt_bytes is None:
            record = replace(record, admission_receipt_bytes=admission_bytes)
            self.records[candidate.key] = record
        return record

    def set_terminal(self, key: CorrelationKey, state: str) -> None:
        self.records[key] = replace(self.records[key], terminal_state=state)

    def retain_effect(self, key: CorrelationKey) -> None:
        record = self.records[key]
        self.records[key] = replace(
            record,
            effect_refs=(*record.effect_refs, "attempt-1"),
            stop_obligation_refs=(*record.stop_obligation_refs, "stop-1"),
        )


JOB_ID = UUID("00000000-0000-4000-8000-000000000001")
KEY = CorrelationKey(host_id="host-1", execution_id="execution-1")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "terminal_state", ["completed", "failed", "cancelled", "timed_out"]
)
async def test_equal_submission_keeps_one_job_through_every_terminal_state(
    terminal_state: str,
) -> None:
    store = MemoryStore()
    coordinator = CorrelationCoordinator(store)
    submission = reserved_submission_bytes()
    first = await coordinator.accept_submission(
        submission,
        job_id=JOB_ID,
        correlation_receipt_bytes=contract_bytes("correlation"),
    )
    store.set_terminal(KEY, terminal_state)
    second = await coordinator.accept_submission(
        submission,
        job_id=UUID("00000000-0000-4000-8000-000000000099"),
        correlation_receipt_bytes=contract_bytes("correlation"),
    )
    assert first == second == contract_bytes("correlation")
    assert store.records[KEY].job_id == JOB_ID
    assert len(store.records) == 1


@pytest.mark.asyncio
async def test_changed_bytes_conflict_and_unknown_lookup_blocks_resubmit() -> None:
    store = MemoryStore()
    coordinator = CorrelationCoordinator(store)
    submission = reserved_submission_bytes()
    await coordinator.accept_submission(
        submission,
        job_id=JOB_ID,
        correlation_receipt_bytes=contract_bytes("correlation"),
    )
    with pytest.raises(ProtocolConflict, match="submission_identity_conflict"):
        await coordinator.accept_submission(
            submission + b" ",
            job_id=JOB_ID,
            correlation_receipt_bytes=contract_bytes("correlation"),
        )
    store.unknown = True
    unknown_submission = json.loads(reserved_submission_bytes())
    unknown_submission["executionId"] = "execution-2"
    unknown_correlation = json.loads(contract_bytes("correlation"))
    unknown_correlation["executionId"] = "execution-2"
    unknown_correlation["engineJobId"] = "00000000-0000-4000-8000-000000000002"
    with pytest.raises(CorrelationUnknown):
        await coordinator.accept_submission(
            json.dumps(unknown_submission, separators=(",", ":")).encode(),
            job_id=UUID("00000000-0000-4000-8000-000000000002"),
            correlation_receipt_bytes=json.dumps(
                unknown_correlation, separators=(",", ":")
            ).encode(),
        )


@pytest.mark.asyncio
async def test_same_identity_with_changed_request_data_conflicts() -> None:
    store = MemoryStore()
    coordinator = CorrelationCoordinator(store)
    submission = reserved_submission_bytes()
    await coordinator.accept_submission(
        submission,
        job_id=JOB_ID,
        correlation_receipt_bytes=contract_bytes("correlation"),
    )
    changed_submission = json.loads(submission)
    changed_submission["requestId"] = "00000000-0000-4000-8000-000000000004"
    with pytest.raises(ProtocolConflict, match="submission_identity_conflict"):
        await coordinator.accept_submission(
            json.dumps(changed_submission, separators=(",", ":")).encode(),
            job_id=JOB_ID,
            correlation_receipt_bytes=contract_bytes("correlation"),
        )


@pytest.mark.asyncio
async def test_closed_admission_suspends_and_opens_for_exact_binding() -> None:
    store = MemoryStore()
    coordinator = CorrelationCoordinator(store)

    async def request_native_work() -> None:
        await coordinator.admission_or_wait(KEY, admission_wait_bytes())
        store.effects += 1

    await coordinator.accept_submission(
        reserved_submission_bytes(),
        job_id=JOB_ID,
        correlation_receipt_bytes=contract_bytes("correlation"),
    )
    with pytest.raises(AdmissionPending) as pending:
        await request_native_work()
    assert pending.value.external_wait_bytes == admission_wait_bytes()
    assert store.effects == 0
    assert await coordinator.open_admission(
        KEY, contract_bytes("admission")
    ) == contract_bytes("admission")
    await request_native_work()
    assert store.effects == 1
    changed_admission = json.loads(contract_bytes("admission"))
    changed_admission["admissionId"] = "admission-2"
    with pytest.raises(ProtocolConflict, match="admission_identity_conflict"):
        await coordinator.open_admission(
            KEY,
            json.dumps(changed_admission, separators=(",", ":")).encode(),
        )


@pytest.mark.asyncio
async def test_recovery_preserves_admitted_effects_and_stop_obligations() -> None:
    store = MemoryStore()
    first_process = CorrelationCoordinator(store)
    await first_process.accept_submission(
        reserved_submission_bytes(),
        job_id=JOB_ID,
        correlation_receipt_bytes=contract_bytes("correlation"),
    )
    await first_process.open_admission(KEY, contract_bytes("admission"))
    store.retain_effect(KEY)
    recovered_process = CorrelationCoordinator(store)
    assert await recovered_process.accept_submission(
        reserved_submission_bytes(),
        job_id=UUID("00000000-0000-4000-8000-000000000099"),
        correlation_receipt_bytes=contract_bytes("correlation"),
    ) == contract_bytes("correlation")
    record = store.records[KEY]
    assert record.effect_refs == ("attempt-1",)
    assert record.stop_obligation_refs == ("stop-1",)
    assert await recovered_process.admission_or_wait(
        KEY, admission_wait_bytes()
    ) == contract_bytes("admission")


@pytest.mark.asyncio
async def test_lost_submit_response_recovers_the_job_waiting_at_admission() -> None:
    store = MemoryStore()
    first_process = CorrelationCoordinator(store)
    submission = reserved_submission_bytes()
    await first_process.accept_submission(
        submission,
        job_id=JOB_ID,
        correlation_receipt_bytes=contract_bytes("correlation"),
    )
    with pytest.raises(AdmissionPending) as pending:
        await first_process.admission_or_wait(KEY, admission_wait_bytes())
    assert pending.value.external_wait_bytes == admission_wait_bytes()
    recovered_process = CorrelationCoordinator(store)
    assert await recovered_process.accept_submission(
        submission,
        job_id=UUID("00000000-0000-4000-8000-000000000099"),
        correlation_receipt_bytes=contract_bytes("correlation"),
    ) == contract_bytes("correlation")
    assert store.effects == 0


@pytest.mark.asyncio
async def test_references_have_no_app_length_ceiling() -> None:
    store = MemoryStore()
    coordinator = CorrelationCoordinator(store)
    submission = json.loads(reserved_submission_bytes())
    submission["hostId"] = "host-" + "a" * 20_000
    correlation = json.loads(contract_bytes("correlation"))
    correlation["hostId"] = submission["hostId"]
    key = CorrelationKey(host_id=submission["hostId"], execution_id="execution-1")
    await coordinator.accept_submission(
        json.dumps(submission, separators=(",", ":")).encode(),
        job_id=JOB_ID,
        correlation_receipt_bytes=json.dumps(
            correlation, separators=(",", ":")
        ).encode(),
    )
    assert (await store.lookup(key)).state == "found"
