from __future__ import annotations

import asyncio
import fcntl
import os
from contextlib import asynccontextmanager
from uuid import UUID

from langflow.services.trellis_v1.backup import SnapshotBinding
from langflow.services.trellis_v1.capture_grants import CaptureConflict, parse_grant
from langflow.services.trellis_v1.capture_store import CaptureGrantStore
from langflow.services.trellis_v1.capture_tasks import finish_capture_task
from langflow.services.trellis_v1.reconciliation_models import ReconciliationConflict
from langflow.services.trellis_v1.reconciliation_store import ReconciliationLeaseStore


class CapturePaused(RuntimeError):
    pass


class CaptureBoundary:
    def __init__(self, store: CaptureGrantStore, reconciliation_store: ReconciliationLeaseStore):
        self.store = store
        self.reconciliation_store = reconciliation_store
        self.path = store.directory / "capture-writers.lock"

    @asynccontextmanager
    async def _exclude(self, exclusive: bool):
        descriptor = os.open(self.path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            CaptureGrantStore._private_file(descriptor)
            operation = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
            while True:
                try:
                    fcntl.flock(descriptor, operation | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    await asyncio.sleep(0.01)
            yield
        finally:
            os.close(descriptor)

    async def _capture_active(self):
        return await asyncio.to_thread(self.store.active)

    async def _reconciliation_active(self):
        return await asyncio.to_thread(self.reconciliation_store.active)

    @asynccontextmanager
    async def writer(self):
        async with self._exclude(False):
            if await self._capture_active() is not None or await self._reconciliation_active() is not None:
                raise CapturePaused("engine_capture_active")
            yield

    async def commit(self, grant_bytes: str):
        async with self._exclude(True):
            await self._capture_active()
            if await self._reconciliation_active() is not None:
                raise CaptureConflict("reconciliation_lease_active")
            return await finish_capture_task(asyncio.to_thread(self.store.commit, grant_bytes))

    async def revoke(self, grant_id: UUID, grant_bytes: str):
        async with self._exclude(True):
            await self._capture_active()
            if await self._reconciliation_active() is not None:
                raise CaptureConflict("reconciliation_lease_active")
            return await finish_capture_task(asyncio.to_thread(self.store.revoke, grant_id, grant_bytes))

    @asynccontextmanager
    async def snapshot(self, binding: SnapshotBinding):
        async with self._exclude(True):
            receipt = await self._capture_active()
            if await self._reconciliation_active() is not None:
                raise CaptureConflict("reconciliation_lease_active")
            if receipt is None:
                raise CaptureConflict("capture_grant_not_active")
            grant = parse_grant(receipt.grantBytes)
            if grant.identity != self.store.identity:
                raise CaptureConflict("capture_runtime_identity_conflict")
            if (grant.snapshotId, grant.boundaryReceiptId, str(grant.identity.dataHomeId), str(grant.identity.hostId)) != (
                str(binding.snapshotId), binding.boundaryReceiptId, binding.sourceDataHomeId, binding.sourceHostId
            ):
                raise CaptureConflict("capture_snapshot_binding_conflict")
            yield

    async def acquire_reconciliation(self, lease_bytes: str, reader):
        async with self._exclude(True):
            if await self._capture_active() is not None:
                raise ReconciliationConflict("capture_grant_active")

            async def acquire():
                identity = await asyncio.to_thread(reader.read, checkpoint=True)
                return await asyncio.to_thread(self.reconciliation_store.acquire, lease_bytes, identity)

            return await finish_capture_task(acquire())

    async def read_reconciliation(self, lease_id: UUID):
        async with self._exclude(False):
            return await asyncio.to_thread(self.reconciliation_store.read, lease_id)

    async def read_reconciliation_identity(self, lease_id: UUID, reader):
        async with self._exclude(False):
            if await self._capture_active() is not None:
                raise ReconciliationConflict("capture_grant_active")
            record = await asyncio.to_thread(self.reconciliation_store.read, lease_id)
            active = await self._reconciliation_active()
            if record.state != "active" or active is None or active.leaseBytes != record.leaseBytes:
                raise ReconciliationConflict("reconciliation_lease_not_active")
            return await asyncio.to_thread(reader.read, checkpoint=False)

    async def release_reconciliation(self, lease_id: UUID, lease_bytes: str, acknowledgement_bytes: str):
        async with self._exclude(True):
            if await self._capture_active() is not None:
                raise ReconciliationConflict("capture_grant_active")
            return await finish_capture_task(
                asyncio.to_thread(
                    self.reconciliation_store.release,
                    lease_id,
                    lease_bytes,
                    acknowledgement_bytes,
                )
            )
