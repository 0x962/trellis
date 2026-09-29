import asyncio
from pathlib import Path
from uuid import UUID

import pytest
from fastapi import APIRouter

from langflow.services.trellis_v1.startup import (
    CONFIG_ENV,
    EngineApiRuntime,
    _CaptureAuthorityBoundary,
    load_engine_api_startup_config,
)


def test_absent_configuration_keeps_startup_inactive(monkeypatch):
    monkeypatch.delenv(CONFIG_ENV, raising=False)
    assert load_engine_api_startup_config() is None


def test_configuration_requires_the_complete_installed_identity(monkeypatch, tmp_path: Path):
    config = tmp_path / "engine-api.json"
    config.write_text('{"version":1}')
    config.chmod(0o600)
    monkeypatch.setenv(CONFIG_ENV, str(config))
    with pytest.raises(ValueError):
        load_engine_api_startup_config()


def test_configuration_preserves_the_selected_paths(monkeypatch, tmp_path: Path):
    catalog = tmp_path / "catalog.json"
    catalog.write_text("{}")
    trellis_root = tmp_path / "trellis"
    engine_root = tmp_path / "engine"
    export_root = tmp_path / "export"
    trellis_root.mkdir()
    engine_root.mkdir()
    config = tmp_path / "engine-api.json"
    config.write_text(
        "{"
        '"version":1,'
        f'"enginePackageDigest":"{"a" * 64}",'
        f'"componentManifestHash":"{"b" * 64}",'
        f'"engineCommit":"{"c" * 40}",'
        f'"catalogPath":"{catalog}",'
        f'"trellisRoot":"{trellis_root}",'
        f'"engineRoot":"{engine_root}",'
        '"userId":"00000000-0000-4000-8000-000000000001",'
        f'"exportRoot":"{export_root}"'
        "}"
    )
    config.chmod(0o600)
    monkeypatch.setenv(CONFIG_ENV, str(config))
    parsed = load_engine_api_startup_config()
    assert parsed is not None
    assert parsed.catalog_path == catalog
    assert parsed.trellis_root == trellis_root
    assert parsed.engine_root == engine_root
    assert parsed.export_root == export_root


def test_capture_revoke_runs_recovery_before_return():
    events = []

    class Boundary:
        store = object()

        async def revoke(self, grant_id, grant_bytes):
            events.append(("revoke", grant_id, grant_bytes))
            return "receipt"

    async def resume():
        events.append(("resume",))

    boundary = _CaptureAuthorityBoundary(Boundary(), resume)
    grant_id = UUID("00000000-0000-4000-8000-000000000001")
    receipt = asyncio.run(boundary.revoke(grant_id, "grant"))
    assert receipt == "receipt"
    assert events == [("revoke", grant_id, "grant"), ("resume",)]


def test_runtime_runs_the_strict_startup_callback():
    events = []

    async def start():
        events.append("started")

    runtime = EngineApiRuntime(router=APIRouter(), start=start)
    asyncio.run(runtime.start())
    assert events == ["started"]
