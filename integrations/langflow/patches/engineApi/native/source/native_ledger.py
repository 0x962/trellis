from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlmodel import select

from langflow.services.database.models.jobs.model import ExecutionSignal, Job, JobStatus, SignalType
from langflow.services.deps import session_scope
from langflow.services.trellis_v1.external_waits import TrellisExternalWaitBroker
from langflow.services.trellis_v1.native_protocol import (
    CompletionInput, NativeConflict, NativeResult, read_json, serialized, validate_completion,
)
from langflow.services.trellis_v1.native_records import (
    acceptance_kind, add_checkpoint, checkpoint, request_kind, saved_wait,
)


class NativeCompletionLedger:
    """Keep accepted bytes and a request to resume the exact saved engine wait."""

    def __init__(self, jobs, *, open_session=session_scope) -> None:
        self._jobs = jobs
        self._open_session = open_session

    async def accept(self, payload: CompletionInput, authorize) -> dict:
        result = read_json(payload.resultBytes)
        NativeResult.model_validate(result)
        job_id = UUID(result["launchBinding"]["engineJobId"])
        async with self._open_session() as session:
            job = (await session.exec(select(Job).where(Job.job_id == job_id).with_for_update())).first()
            authority = await authorize(result["launchBinding"])
            retained = await checkpoint(session, job_id, acceptance_kind(payload.engineWaitId))
            if retained is not None:
                saved = read_json(retained.blob)
                validate_completion(payload, read_json(saved["waitBytes"]), saved["requestBytes"], authority)
                if saved["resultBytes"] != payload.resultBytes:
                    raise NativeConflict("native_completion_replay_conflict")
                return saved["obligation"]
            if job is None or job.status not in {JobStatus.SUSPENDED, JobStatus.QUEUED, JobStatus.IN_PROGRESS}:
                raise NativeConflict("native_job_not_pending")
            wait_bytes = await saved_wait(session, job_id, payload.engineWaitId)
            original = await checkpoint(session, job_id, request_kind(payload.engineWaitId))
            if wait_bytes is None or original is None:
                raise NativeConflict("native_wait_not_retained")
            result = validate_completion(payload, read_json(wait_bytes), original.blob, authority)
            signal_id, obligation_id = uuid4(), uuid4()
            receipt_bytes = serialized({
                "version": 1, "executionId": result["launchBinding"]["executionId"], "engineJobId": str(job_id),
                "completionId": result["completionId"], "resultDigest": read_json(payload.deliveryBytes)["resultDigest"],
                "engineWaitId": payload.engineWaitId, "continuationReceiptId": str(obligation_id),
                "acceptedAt": datetime.now(timezone.utc).isoformat(),
            })
            await TrellisExternalWaitBroker(self._jobs).save_completion_in_session(
                session, job_id=job_id, authority_epoch=authority["engineEpoch"], wait_bytes=wait_bytes,
                delivery_bytes=payload.deliveryBytes, receipt_bytes=receipt_bytes,
            )
            obligation = {
                "version": 1, "engineJobId": str(job_id), "engineWaitId": payload.engineWaitId,
                "completionId": result["completionId"], "signalId": str(signal_id),
                "enqueueObligationId": str(obligation_id), "receiptBytes": receipt_bytes,
            }
            session.add(ExecutionSignal(id=signal_id, job_id=job_id, signal_type=SignalType.RESUME, data={
                "kind": "trellis_external_completion_v1", "engineRequestId": payload.engineWaitId,
                "decisionId": None, "enqueueObligationId": str(obligation_id),
            }))
            add_checkpoint(session, job_id, acceptance_kind(payload.engineWaitId), serialized({
                "waitBytes": wait_bytes, "requestBytes": original.blob, "resultBytes": payload.resultBytes,
                "deliveryBytes": payload.deliveryBytes, "obligation": obligation,
            }))
            add_checkpoint(session, job_id, f"trellis-native-obligation-v1:{obligation_id}", serialized({
                **obligation, "state": "pending", "continuationReceiptBytes": None,
            }))
            await session.flush()
            return obligation

    async def observe(self, job_id: UUID, wait_id: str, authorize) -> dict:
        async with self._open_session() as session:
            retained = await checkpoint(session, job_id, acceptance_kind(wait_id))
            accepted = None if retained is None else read_json(retained.blob)
            wait_bytes = accepted["waitBytes"] if accepted else await saved_wait(session, job_id, wait_id)
            if wait_bytes is None:
                raise NativeConflict("native_wait_not_retained")
            wait = read_json(wait_bytes)
            if wait["kind"] != "native":
                raise NativeConflict("native_wait_kind_conflict")
            await authorize(wait["request"])
            return {
                "version": 1, "engineJobId": str(job_id), "engineWaitId": wait_id,
                "state": "waiting" if accepted is None else "completed", "waitBytes": wait_bytes,
                "resultBytes": None if accepted is None else accepted["resultBytes"],
                "receiptBytes": None if accepted is None else accepted["obligation"]["receiptBytes"],
            }
