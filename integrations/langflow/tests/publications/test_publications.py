import asyncio
import base64
import hashlib
import importlib.util
import json
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI, Header, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from langflow.api.v1.trellis_publications import create_publication_router
from langflow.services.database.models import Flow, User
from langflow.services.trellis_publications import ledger
from langflow.services.trellis_publications.contracts import InstalledPublicationPackage

ROOT = Path(__file__).resolve().parents[4]
USER = "00000000-0000-4000-8000-000000000001"


def request_bytes():
    source = {"engine": "langflow", "schemaVersion": 1,
              "graphDocument": {"nodes": [], "edges": []}, "componentManifestHash": "c" * 64}
    raw = json.dumps(source, separators=(",", ":")).encode()
    snapshot = {**source, "revision": 2, "documentHash": hashlib.sha256(raw).hexdigest(),
                "flow": {"id": "00000000000000000000000001", "version": 2, "name": "Review"}, "diagnostics": []}
    return json.dumps({"enginePackageDigest": "d" * 64, "snapshot": snapshot,
                       "sourceBytes": base64.b64encode(raw).decode()}, separators=(",", ":")).encode()


def test_authenticated_atomic_receipt_and_immutability(tmp_path, monkeypatch):
    async def run():
        engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'engine.db'}")
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        @asynccontextmanager
        async def scope():
            async with sessions() as session:
                yield session
        monkeypatch.setattr(ledger, "session_scope", scope)
        # This isolates storage from graph acceptance; the real catalog stays blocked.
        monkeypatch.setattr(ledger, "validate", lambda *_: [])
        def initialize(connection):
            SQLModel.metadata.create_all(connection)
            path = ROOT / "integrations/langflow/patches/publications/files/src/backend/base/langflow/alembic/versions/8c0f2d5b3e7a_trellis_publications.py"
            spec = importlib.util.spec_from_file_location("publication_migration", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            with Operations.context(MigrationContext.configure(connection)):
                module.upgrade()
        async with engine.begin() as connection:
            await connection.run_sync(initialize)
        async with scope() as session:
            session.add(User(id=UUID(USER), username="publisher", password="fixture", is_active=True))
            await session.commit()
        token = tmp_path / "token"
        token.write_text("private-fixture-token")
        token.chmod(0o600)
        app = FastAPI()
        package = InstalledPublicationPackage(
            engine_package_digest="d" * 64, component_manifest_hash="c" * 64,
            engine_commit="f" * 40, catalog_path=tmp_path / "absent-catalog",
            trellis_root=ROOT, engine_root=tmp_path, user_id=USER)
        def require_transport_auth(authorization: str = Header(default="")):
            if authorization != f"Bearer {token.read_text()}":
                raise HTTPException(401, "publication_authentication_required")
        app.include_router(create_publication_router(package, require_transport_auth=require_transport_auth), prefix="/trellis-v1")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://engine") as client:
            raw = request_bytes()
            endpoint = "/trellis-v1/publications"
            assert (await client.post(endpoint, content=raw)).status_code == 401
            headers = {"Authorization": "Bearer private-fixture-token"}
            first = await client.post(endpoint, content=raw, headers=headers)
            assert first.status_code == 200, first.text
            receipt = first.json()
            # Recreate the client after the committed response is lost.
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://engine") as client:
            replay = await client.post(endpoint, content=raw, headers=headers)
            assert replay.json() == receipt
            assert (await client.post(endpoint, content=raw + b" ", headers=headers)).status_code == 409
            read = await client.get(f"{endpoint}/{receipt['flowId']}/2", headers=headers)
            assert read.json()["publication"] == receipt
            assert read.json()["sourceBytes"] == json.loads(raw)["sourceBytes"]
        async with scope() as session:
            assert (await session.execute(sa.select(sa.func.count()).select_from(Flow))).scalar() == 1
        for statement in (
            "UPDATE flow SET name='changed'", "DELETE FROM flow",
            "UPDATE trellis_document_publications SET revision=3", "DELETE FROM trellis_document_publications",
        ):
            with pytest.raises(sa.exc.DatabaseError):
                async with engine.begin() as connection:
                    await connection.execute(sa.text(statement))
        await engine.dispose()
    asyncio.run(run())


def test_real_catalog_refuses_unapproved_component(tmp_path):
    import os
    from langflow.services.trellis_publications.contracts import PublicationRequest
    from langflow.services.trellis_publications.validation import validate
    engine_root = os.environ.get("TRELLIS_PUBLICATION_ENGINE_ROOT")
    if engine_root is None:
        pytest.skip("The matched engine source root is required for source digest verification.")
    catalog_path = ROOT / "integrations/langflow/components/catalog/manifest.v1.json"
    catalog = json.loads(catalog_path.read_bytes())
    digest = hashlib.sha256(catalog_path.read_bytes()).hexdigest()
    blocked = next(entry for entry in catalog["definitions"] if not entry["allowedForPublication"])
    value = json.loads(request_bytes())
    value["snapshot"]["componentManifestHash"] = digest
    value["snapshot"]["graphDocument"]["nodes"] = [{"id": "blocked", "data": {"type": blocked["className"]}}]
    source = {key: value["snapshot"][key] for key in ("engine", "schemaVersion", "graphDocument", "componentManifestHash")}
    raw = json.dumps(source).encode()
    value["sourceBytes"] = base64.b64encode(raw).decode()
    value["snapshot"]["documentHash"] = hashlib.sha256(raw).hexdigest()
    package = InstalledPublicationPackage(engine_package_digest="d" * 64, component_manifest_hash=digest,
        engine_commit=catalog["engine"]["commit"], catalog_path=catalog_path,
        trellis_root=ROOT, engine_root=Path(engine_root), user_id=USER)
    assert validate(PublicationRequest.model_validate(value), package)[0]["code"] == "publication_component_not_approved"
    value["enginePackageDigest"] = "e" * 64
    assert validate(PublicationRequest.model_validate(value), package)[0]["code"] == "publication_package_mismatch"
