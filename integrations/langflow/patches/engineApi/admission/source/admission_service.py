from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from lfx.graph.checkpoint.schema import GraphCheckpoint
from langflow.services.deps import session_scope
from langflow.services.trellis_publications.ledger import resolve_publication
from langflow.services.trellis_v1.correlation import (
    AdmissionContinuation,
    AdmissionEnqueueObligation,
    CorrelationCoordinator,
    CorrelationKey,
    CorrelationUnknown,
    JobServiceCorrelationStore,
    ProtocolConflict,
    _admission,
    _read,
    _submission,
)

from .admission_lookup import actor_key, read_correlation
from .admission_models import Absent, Admitted, EngineKey, Found, Pending, SubmissionPayload
from .admission_request import submission_request
from .admission_store import AuthorizedCorrelationStore


class AdmissionService:
    def __init__(self, *, jobs, background, host_id: str):
        self.jobs = jobs
        self.background = background
        self.host_id = host_id

    async def dispatch_submission(self, record):
        job = await self.jobs.get_job_by_job_id(record.job_id)
        return await self.background.enqueue_trellis_submission(
            engine_job_id=record.job_id, flow_id=job.flow_id, user_id=job.user_id,
            request_bytes=submission_request(job.flow_id, record.engine_session_id),
        )

    def require_host(self, host_id: str) -> None:
        if host_id != self.host_id:
            raise ProtocolConflict("admission_host_conflict")

    async def lookup(self, key: EngineKey) -> Found | Absent:
        self.require_host(key.hostId)
        row = await read_correlation(key.hostId, key.executionId)
        if row is None:
            return Absent(key=key)
        return Found(receiptBytes=bytes(row.correlation_receipt_bytes).decode("utf-8"))

    async def submit(self, envelope_bytes: bytes, payload_bytes: bytes) -> Found:
        submission = _submission(envelope_bytes)
        self.require_host(submission["hostId"])
        if hashlib.sha256(payload_bytes).hexdigest() != submission["submissionDigest"]:
            raise ProtocolConflict("submission_payload_digest_conflict")
        key = CorrelationKey(
            actor_kind=submission["actor"]["kind"], actor_name=submission["actor"]["name"],
            request_id=UUID(submission["requestId"]),
        )
        prior = await self.jobs.lookup_trellis_correlation(key)
        if prior is not None:
            if prior.submission_bytes != envelope_bytes:
                raise ProtocolConflict("submission_identity_conflict")
            if prior.terminal_state is None:
                await self.dispatch_submission(prior)
            return Found(receiptBytes=prior.correlation_receipt_bytes.decode("utf-8"))
        payload = SubmissionPayload.model_validate_json(payload_bytes)
        if payload.publication.get("publicationId") != submission["publicationId"]:
            raise ProtocolConflict("submission_publication_conflict")
        async with session_scope() as session:
            publication = await resolve_publication(session, payload.snapshot, payload.publication)
        coordinator = CorrelationCoordinator(JobServiceCorrelationStore(
            self.jobs, flow_id=publication["flow_id"], user_id=publication["user_id"],
        ))
        job_id = uuid4()
        receipt = {
            "version": 1, "hostId": self.host_id, "executionId": submission["executionId"],
            "publicationId": submission["publicationId"], "submissionDigest": submission["submissionDigest"],
            "engineJobId": str(job_id), "engineSessionId": str(uuid4()),
            "recordedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        }
        receipt_bytes = await coordinator.accept_submission(
            envelope_bytes, job_id=job_id,
            correlation_receipt_bytes=json.dumps(receipt, separators=(",", ":")).encode("utf-8"),
        )
        record = await self.jobs.lookup_trellis_correlation(key)
        await self.dispatch_submission(record)
        return Found(receiptBytes=receipt_bytes.decode("utf-8"))

    async def open(self, receipt_bytes: bytes, authority_bytes: bytes, *, require_authority) -> Admitted | Pending:
        receipt = _admission(_read(receipt_bytes, "admission"))
        row = await read_correlation(self.host_id, receipt["executionId"])
        if row is None:
            raise CorrelationUnknown(receipt["executionId"])
        if row.admission_receipt_bytes is not None:
            continuation = AdmissionContinuation(
                engine_request_id=row.continuation_engine_request_id,
                signal_id=row.continuation_signal_id, enqueue_obligation_id=row.enqueue_obligation_id,
            )
        else:
            checkpoint_bytes = await self.jobs.load_checkpoint(row.engine_job_id, "graph")
            if checkpoint_bytes is None:
                return Pending()
            checkpoint = GraphCheckpoint.model_validate_json(checkpoint_bytes)
            waits = [json.loads(raw) for raw in checkpoint.external_waits.values()]
            matches = [wait for wait in waits if wait.get("kind") == "admission" and wait.get("barrierId") == row.barrier_id]
            if not matches:
                return Pending()
            if len(matches) != 1:
                raise ProtocolConflict("admission_wait_identity_conflict")
            wait_id = matches[0]["waitId"]
            identity = f"trellis-admission:{row.engine_job_id}:{wait_id}"
            continuation = AdmissionContinuation(
                engine_request_id=wait_id, signal_id=uuid5(NAMESPACE_URL, f"{identity}:signal"),
                enqueue_obligation_id=uuid5(NAMESPACE_URL, f"{identity}:enqueue"),
            )

        async def verify(session):
            binding = await require_authority(
                session, authority_bytes, "native.reserve",
                execution_id=receipt["executionId"], publication_id=receipt["publicationId"],
                engine_job_id=UUID(receipt["engineJobId"]),
            )
            if binding.engine_epoch != receipt["engineEpoch"] or binding.authority.host_id != self.host_id:
                raise ProtocolConflict("admission_authority_binding_conflict")

        job = await self.jobs.get_job_by_job_id(row.engine_job_id)
        coordinator = CorrelationCoordinator(AuthorizedCorrelationStore(
            self.jobs, flow_id=job.flow_id, user_id=job.user_id, require_authority=verify,
        ))
        commit = await coordinator.open_admission(actor_key(row), receipt_bytes, continuation)
        await self.background._consume_trellis_admission_obligation(AdmissionEnqueueObligation(
            engine_job_id=row.engine_job_id, engine_request_id=continuation.engine_request_id,
            signal_id=continuation.signal_id, enqueue_obligation_id=continuation.enqueue_obligation_id,
            continuation_receipt_bytes=commit.continuation_receipt_bytes,
        ))
        return Admitted(receiptBytes=commit.record.admission_receipt_bytes.decode("utf-8"))
