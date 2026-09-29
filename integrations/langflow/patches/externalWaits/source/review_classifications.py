from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from langflow.services.database.models.jobs.model import ExecutionSignal, Job, JobCheckpoint, JobStatus, SignalType
from langflow.services.deps import session_scope
from langflow.services.trellis_v1.cancellation import assert_not_cancelled
from langflow.services.trellis_v1.external_waits import TrellisExternalWaitBroker
from langflow.services.trellis_v1.native_records import add_checkpoint, checkpoint, saved_wait
from langflow.services.trellis_v1.review_protocol import (
    ReviewConflict,
    ReviewDeliveryInput,
    read_review_response,
    read_review_wait,
    review_digest,
    review_json,
    validate_review_delivery,
)

AuthorityVerifier = Callable[[AsyncSession, dict[str, Any]], Awaitable[dict[str, Any]]]


def acceptance_kind(engine_request_id: str) -> str:
    return f"trellis-review-acceptance-v1:{review_digest(engine_request_id.encode('utf-8'))}"


def obligation_kind(enqueue_obligation_id: str) -> str:
    return f"trellis-review-obligation-v1:{enqueue_obligation_id}"


class ReviewClassificationLedger:
    """Keep one accepted result and one resume obligation for each saved review wait."""

    def __init__(self, jobs, *, open_session=session_scope) -> None:
        self._jobs = jobs
        self._open_session = open_session

    async def accept(self, payload: ReviewDeliveryInput, authorize: AuthorityVerifier) -> dict:
        response = read_review_response(payload.resultBytes.decode("utf-8"))
        if response.result.state == "claimed":
            raise ReviewConflict("review_result_not_terminal")
        job_id = UUID(response.visit.engineJobId)
        async with self._open_session() as session:
            job = (await session.exec(select(Job).where(Job.job_id == job_id).with_for_update())).first()
            if job is None:
                raise ReviewConflict("review_job_missing")
            wait_bytes = await saved_wait(session, job_id, payload.engineWaitId)
            if wait_bytes is None:
                raise ReviewConflict("review_wait_not_retained")
            wait = read_review_wait(wait_bytes)
            authority = await authorize(session, wait.request.model_dump(mode="json"))
            retained = await checkpoint(session, job_id, acceptance_kind(wait.request.engineRequestId))
            if retained is not None:
                saved = json.loads(retained.blob)
                validate_review_delivery(payload, saved["waitBytes"].encode("utf-8"), authority)
                if (
                    saved["resultBytes"].encode("utf-8") != payload.resultBytes
                    or saved["deliveryBytes"].encode("utf-8") != payload.deliveryBytes
                    or saved["authorityBytes"].encode("utf-8") != payload.authorityBytes
                ):
                    raise ReviewConflict("review_classification_replay_conflict")
                return saved["obligation"]
            if job.status not in {JobStatus.SUSPENDED, JobStatus.QUEUED, JobStatus.IN_PROGRESS}:
                raise ReviewConflict("review_job_not_pending")
            await assert_not_cancelled(session, job_id)
            external_wait, response, delivery = validate_review_delivery(
                payload,
                wait_bytes.encode("utf-8"),
                authority,
            )
            signal_id = uuid4()
            acceptance_id = uuid4()
            obligation_id = uuid4()
            accepted_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            receipt_bytes = review_json({
                "version": 1,
                "executionId": external_wait.request.executionId,
                "engineJobId": str(job_id),
                "engineRequestId": external_wait.request.engineRequestId,
                "classificationReceiptId": response.result.classificationReceiptId,
                "resultDigest": delivery.resultDigest,
                "engineWaitId": external_wait.waitId,
                "acceptanceId": str(acceptance_id),
                "signalId": str(signal_id),
                "enqueueObligationId": str(obligation_id),
                "acceptedAt": accepted_at,
            })
            await TrellisExternalWaitBroker(self._jobs).save_completion_in_session(
                session,
                job_id=job_id,
                authority_epoch=authority["engineEpoch"],
                wait_bytes=wait_bytes.encode("utf-8"),
                delivery_bytes=payload.deliveryBytes,
                receipt_bytes=receipt_bytes.encode("utf-8"),
            )
            obligation = {
                "version": 1,
                "engineJobId": str(job_id),
                "engineWaitId": external_wait.waitId,
                "engineRequestId": external_wait.request.engineRequestId,
                "classificationReceiptId": response.result.classificationReceiptId,
                "signalId": str(signal_id),
                "enqueueObligationId": str(obligation_id),
                "receiptBytes": receipt_bytes,
            }
            session.add(ExecutionSignal(
                id=signal_id,
                job_id=job_id,
                signal_type=SignalType.RESUME,
                data={
                    "kind": "trellis_external_completion_v1",
                    "engineRequestId": external_wait.request.engineRequestId,
                    "decisionId": None,
                    "enqueueObligationId": str(obligation_id),
                },
            ))
            add_checkpoint(session, job_id, acceptance_kind(external_wait.request.engineRequestId), review_json({
                "waitBytes": wait_bytes,
                "resultBytes": payload.resultBytes.decode("utf-8"),
                "deliveryBytes": payload.deliveryBytes.decode("utf-8"),
                "authorityBytes": payload.authorityBytes.decode("utf-8"),
                "obligation": obligation,
            }))
            add_checkpoint(session, job_id, obligation_kind(str(obligation_id)), review_json({
                **obligation,
                "state": "pending",
                "continuationReceiptBytes": None,
            }))
            await session.flush()
            return obligation

    async def read_result(self, *, engine_job_id: UUID, engine_request_id: str) -> bytes | None:
        async with self._open_session() as session:
            retained = await checkpoint(session, engine_job_id, acceptance_kind(engine_request_id))
            if retained is None:
                return None
            saved = json.loads(retained.blob)
            if saved["obligation"]["engineRequestId"] != engine_request_id:
                raise ReviewConflict("review_result_identity_conflict")
            return saved["resultBytes"].encode("utf-8")

    async def pending(self) -> list[dict]:
        async with self._open_session() as session:
            rows = (await session.exec(select(JobCheckpoint).where(
                JobCheckpoint.kind.startswith("trellis-review-obligation-v1:"),
            ))).all()
            return [
                {key: value for key, value in saved.items() if key not in {"state", "continuationReceiptBytes"}}
                for row in rows
                if (saved := json.loads(row.blob))["state"] == "pending"
            ]

    async def mark_consumed(self, obligation: dict, continuation_receipt_bytes: bytes) -> None:
        job_id = UUID(obligation["engineJobId"])
        async with self._open_session() as session:
            await session.exec(select(Job).where(Job.job_id == job_id).with_for_update())
            row = await checkpoint(session, job_id, obligation_kind(obligation["enqueueObligationId"]))
            if row is None:
                raise ReviewConflict("review_obligation_missing")
            saved = json.loads(row.blob)
            expected = {key: value for key, value in saved.items() if key not in {"state", "continuationReceiptBytes"}}
            if expected != obligation:
                raise ReviewConflict("review_obligation_conflict")
            continuation = await checkpoint(
                session,
                job_id,
                f"trellis-continuation-v1:{obligation['enqueueObligationId']}",
            )
            if continuation is None or continuation.blob.encode("utf-8") != continuation_receipt_bytes:
                raise ReviewConflict("review_continuation_bytes_conflict")
            receipt = json.loads(continuation.blob)
            binding = {
                "engineJobId": obligation["engineJobId"],
                "engineRequestId": obligation["engineRequestId"],
                "decisionId": None,
                "signalId": obligation["signalId"],
                "enqueueObligationId": obligation["enqueueObligationId"],
            }
            if any(receipt.get(key) != value for key, value in binding.items()):
                raise ReviewConflict("review_continuation_identity_conflict")
            if saved["continuationReceiptBytes"] is not None:
                if saved["continuationReceiptBytes"] != continuation.blob:
                    raise ReviewConflict("review_consumption_replay_conflict")
                return
            row.blob = review_json({
                **saved,
                "state": "consumed",
                "continuationReceiptBytes": continuation.blob,
            })
            row.updated_at = datetime.now(timezone.utc)
            session.add(row)
            await session.flush()
