import hashlib
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, UUID, uuid5

import sqlalchemy as sa
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from langflow.services.database.models.flow.model import Flow
from langflow.services.deps import session_scope

from .contracts import InstalledPublicationPackage, PublicationRequest
from .validation import validate

metadata = sa.MetaData()
publications = sa.Table(
    "trellis_document_publications", metadata,
    sa.Column("flow_id", sa.Text, primary_key=True),
    sa.Column("revision", sa.Integer, primary_key=True),
    sa.Column("engine_flow_id", sa.Uuid, nullable=False, unique=True),
    sa.Column("request_bytes", sa.LargeBinary, nullable=False),
    sa.Column("receipt", sa.JSON, nullable=False),
)


def replay(row, raw: bytes) -> dict:
    if bytes(row.request_bytes) != raw:
        raise HTTPException(409, "publication_request_conflict")
    return row.receipt


async def read(flow_id: str, revision: int) -> dict:
    async with session_scope() as session:
        row = (await session.execute(sa.select(publications).where(
            publications.c.flow_id == flow_id, publications.c.revision == revision))).first()
        if row is None:
            raise HTTPException(404, "publication_not_found")
        request = PublicationRequest.model_validate_json(row.request_bytes)
        return {"publication": row.receipt, "snapshot": request.snapshot, "sourceBytes": request.sourceBytes,
                "requestDigest": hashlib.sha256(row.request_bytes).hexdigest()}


async def publish(request: PublicationRequest, raw: bytes, package: InstalledPublicationPackage) -> dict:
    source = request.source()
    snapshot = request.snapshot
    key = (snapshot["flow"]["id"], snapshot["revision"])
    predicate = sa.and_(publications.c.flow_id == key[0], publications.c.revision == key[1])
    async with session_scope() as session:
        prior = (await session.execute(sa.select(publications).where(predicate))).first()
        if prior is not None:
            return replay(prior, raw)
    diagnostics = validate(request, package)
    if diagnostics:
        raise HTTPException(422, {"diagnostics": diagnostics})
    identity = f"trellis-publication:{key[0]}:{key[1]}"
    engine_id = uuid5(NAMESPACE_URL, identity)
    number = int.from_bytes(hashlib.sha256(identity.encode()).digest()[:16], "big")
    alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    publication_id = "".join(alphabet[(number >> (5 * index)) & 31] for index in range(25, -1, -1))
    receipt = {
        "publicationId": publication_id, "flowId": key[0], "revision": key[1],
        "documentHash": hashlib.sha256(source).hexdigest(), "engineFlowId": str(engine_id),
        "enginePackageDigest": request.enginePackageDigest,
        "componentManifestHash": snapshot["componentManifestHash"],
        "publishedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "conversion": None,
    }
    try:
        async with session_scope() as session:
            flow = Flow(id=engine_id, name=identity, data=snapshot["graphDocument"],
                        user_id=UUID(package.user_id), locked=True)
            session.add(flow)
            await session.flush()
            await session.execute(publications.insert().values(
                flow_id=key[0], revision=key[1], engine_flow_id=engine_id, request_bytes=raw, receipt=receipt))
            await session.commit()
    except IntegrityError:
        # A concurrent request can commit the same immutable flow before this transaction.
        async with session_scope() as session:
            prior = (await session.execute(sa.select(publications).where(predicate))).first()
            if prior is None:
                raise
            return replay(prior, raw)
    return receipt


async def resolve_publication(session, snapshot: dict, publication: dict) -> dict:
    row = (await session.execute(sa.select(publications).where(
        publications.c.flow_id == snapshot["flow"]["id"],
        publications.c.revision == snapshot["revision"]))).first()
    if row is None or row.receipt != publication:
        raise HTTPException(409, "publication_snapshot_conflict")
    request = PublicationRequest.model_validate_json(row.request_bytes)
    if request.snapshot != snapshot:
        raise HTTPException(409, "publication_snapshot_conflict")
    request.source()
    flow = await session.get(Flow, row.engine_flow_id)
    if flow is None or flow.data != snapshot["graphDocument"] or flow.user_id is None:
        raise HTTPException(409, "publication_engine_flow_conflict")
    return {"flow_id": flow.id, "user_id": flow.user_id}
