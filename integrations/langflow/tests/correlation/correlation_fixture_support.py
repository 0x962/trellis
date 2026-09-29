from __future__ import annotations

import json
import os
import subprocess
from dataclasses import replace
from pathlib import Path
from uuid import UUID

from langflow.services.trellis_v1.correlation import (
    AdmissionCommit,
    AdmissionContinuation,
    CorrelationKey,
    LookupResult,
    StoredCorrelation,
)

TRELLIS_ROOT = Path(os.environ.get("TRELLIS_ROOT", Path(__file__).parents[4]))
TRL_666_SOURCE = "6246fcca805f6e5390f26b7924e28f27f7de0409"
JOB_ID = UUID("00000000-0000-4000-8000-000000000001")
RETRY_JOB_ID = UUID("00000000-0000-4000-8000-000000000099")
FLOW_ID = UUID("00000000-0000-4000-8000-000000000007")
USER_ID = UUID("00000000-0000-4000-8000-000000000008")
KEY = CorrelationKey(
    actor_kind="human",
    actor_name="fixture-human",
    request_id=UUID("00000000-0000-4000-8000-000000000003"),
)
CONTINUATION = AdmissionContinuation(
    engine_request_id="admission-wait-1",
    signal_id=UUID("00000000-0000-4000-8000-000000000005"),
    enqueue_obligation_id=UUID("00000000-0000-4000-8000-000000000006"),
)


def contract_bytes(name: str) -> bytes:
    result = subprocess.run(
        [
            "git",
            "-C",
            str(TRELLIS_ROOT),
            "show",
            f"{TRL_666_SOURCE}:apps/server/src/langflowContracts/fixtures/{name}.json",
        ],
        check=True,
        capture_output=True,
    )
    return result.stdout


def reserved_submission_bytes() -> bytes:
    submission = json.loads(contract_bytes("submission"))
    submission["state"] = "reserved"
    submission["correlation"] = None
    submission["admission"] = {"state": "closed", "barrierId": "barrier-1"}
    return json.dumps(submission, separators=(",", ":")).encode()


def admission_wait_bytes() -> bytes:
    return b'{"kind":"admission","waitId":"admission-wait-1","barrierId":"barrier-1"}'


def correlation_variant(
    *,
    request_id: UUID,
    execution_id: str,
    job_id: UUID,
    engine_session_id: str,
) -> tuple[bytes, bytes]:
    submission = json.loads(reserved_submission_bytes())
    submission["requestId"] = str(request_id)
    submission["executionId"] = execution_id
    correlation = json.loads(contract_bytes("correlation"))
    correlation["executionId"] = execution_id
    correlation["engineJobId"] = str(job_id)
    correlation["engineSessionId"] = engine_session_id
    return (
        json.dumps(submission, separators=(",", ":")).encode(),
        json.dumps(correlation, separators=(",", ":")).encode(),
    )


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
        return self.records.setdefault(candidate.key, candidate)

    async def commit_admission(
        self,
        candidate: StoredCorrelation,
        admission_bytes: bytes,
        continuation: AdmissionContinuation,
    ) -> AdmissionCommit:
        record = self.records[candidate.key]
        if record.admission_receipt_bytes is None:
            record = replace(record, admission_receipt_bytes=admission_bytes)
            self.records[candidate.key] = record
        receipt = json.dumps(
            {
                "engineRequestId": continuation.engine_request_id,
                "signalId": str(continuation.signal_id),
                "enqueueObligationId": str(continuation.enqueue_obligation_id),
                "queueClaimed": True,
            },
            separators=(",", ":"),
        ).encode()
        return AdmissionCommit(record=record, continuation_receipt_bytes=receipt)

    def set_terminal(self, key: CorrelationKey, state: str) -> None:
        self.records[key] = replace(self.records[key], terminal_state=state)

    def retain_effect(self, key: CorrelationKey) -> None:
        record = self.records[key]
        self.records[key] = replace(
            record,
            effect_refs=(*record.effect_refs, "attempt-1"),
            stop_obligation_refs=(*record.stop_obligation_refs, "stop-1"),
        )
