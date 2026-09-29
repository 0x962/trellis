from __future__ import annotations

import asyncio

import pytest

from langflow.services.trellis_v1.backup import SnapshotBinding
from langflow.services.trellis_v1.capture_boundary import CaptureBoundary, CapturePaused
from langflow.services.trellis_v1.capture_grants import CaptureConflict, parse_grant
from langflow.services.trellis_v1.capture_store import CaptureGrantStore
from test_capture_store import capture_store, grant_bytes


def snapshot_binding(grant):
    return SnapshotBinding.model_validate({
        "snapshotId": grant.snapshotId,
        "sourceDataHomeId": str(grant.identity.dataHomeId),
        "sourceHostId": str(grant.identity.hostId),
        "boundaryReceiptId": grant.boundaryReceiptId,
        "compatibility": {
            "trellisRelease": "fixture", "enginePackageDigest": "a" * 64,
            "trellisDatabaseVersion": "fixture", "engineDatabaseVersion": "fixture", "secretVersion": "fixture",
        },
    })


@pytest.mark.asyncio
async def test_capture_drains_writers_and_revoke_drains_export(capture_store):
    boundary = CaptureBoundary(capture_store)
    original = grant_bytes(capture_store)
    grant = parse_grant(original)
    started = asyncio.Event()

    async def commit():
        started.set()
        return await boundary.commit(original)

    async with boundary.writer():
        committing = asyncio.create_task(commit())
        await started.wait()
        await asyncio.sleep(0)
        assert not committing.done()
    assert (await committing).state == "active"
    reopened = CaptureBoundary(CaptureGrantStore(capture_store.directory, capture_store.identity))
    with pytest.raises(CapturePaused):
        async with reopened.writer():
            pytest.fail("A persisted grant admitted a writer")
    async with boundary.snapshot(snapshot_binding(grant)):
        revoking = asyncio.create_task(reopened.revoke(grant.id, original))
        await asyncio.sleep(0)
        assert not revoking.done()
    assert (await revoking).state == "revoked"
    async with reopened.writer():
        pass


@pytest.mark.asyncio
async def test_export_failure_retains_capture(capture_store):
    boundary = CaptureBoundary(capture_store)
    original = grant_bytes(capture_store)
    grant = parse_grant(original)
    await boundary.commit(original)
    with pytest.raises(RuntimeError, match="failed_export"):
        async with boundary.snapshot(snapshot_binding(grant)):
            raise RuntimeError("failed_export")
    assert capture_store.read(grant.id).state == "active"
    with pytest.raises(CapturePaused):
        async with boundary.writer():
            pytest.fail("Export failure opened writers")
    changed = snapshot_binding(grant).model_copy(update={"boundaryReceiptId": "forged"})
    with pytest.raises(CaptureConflict, match="binding_conflict"):
        async with boundary.snapshot(changed):
            pytest.fail("A forged snapshot entered the boundary")


@pytest.mark.asyncio
async def test_snapshot_requires_persisted_grant(capture_store):
    boundary = CaptureBoundary(capture_store)
    grant = parse_grant(grant_bytes(capture_store))
    with pytest.raises(CaptureConflict, match="not_active"):
        async with boundary.snapshot(snapshot_binding(grant)):
            pytest.fail("Request fields granted the snapshot")


@pytest.mark.asyncio
async def test_cancelled_export_holds_exclusion_until_export_finishes(capture_store, monkeypatch, tmp_path):
    from langflow.services.trellis_v1 import backup

    boundary = CaptureBoundary(capture_store)
    original = grant_bytes(capture_store)
    grant = parse_grant(original)
    await boundary.commit(original)
    started = asyncio.Event()
    finish = asyncio.Event()

    async def export(*arguments, **keywords):
        started.set()
        await finish.wait()
        return "saved-receipt"

    monkeypatch.setattr(backup, "_export_engine_snapshot", export)
    task = asyncio.create_task(backup.capture_engine_snapshot(
        None, None, tmp_path, snapshot_binding(grant), package_digest="a" * 64,
        data_home_id=str(grant.identity.dataHomeId), host_id=str(grant.identity.hostId),
        snapshot_boundary=boundary.snapshot,
    ))
    await started.wait()
    task.cancel()
    revoking = asyncio.create_task(boundary.revoke(grant.id, original))
    await asyncio.sleep(0)
    assert not task.done()
    assert not revoking.done()
    finish.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert (await revoking).state == "revoked"
