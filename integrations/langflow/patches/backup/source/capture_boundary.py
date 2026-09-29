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


class CapturePaused(RuntimeError):
    pass


class CaptureBoundary:
    def __init__(self, store: CaptureGrantStore):
        self.store = store
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

    @asynccontextmanager
    async def writer(self):
        async with self._exclude(False):
            if await asyncio.to_thread(self.store.active) is not None:
                raise CapturePaused("engine_capture_active")
            yield

    async def commit(self, grant_bytes: str):
        async with self._exclude(True):
            return await finish_capture_task(asyncio.to_thread(self.store.commit, grant_bytes))

    async def revoke(self, grant_id: UUID, grant_bytes: str):
        async with self._exclude(True):
            return await finish_capture_task(asyncio.to_thread(self.store.revoke, grant_id, grant_bytes))

    @asynccontextmanager
    async def snapshot(self, binding: SnapshotBinding):
        async with self._exclude(False):
            receipt = await asyncio.to_thread(self.store.active)
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
