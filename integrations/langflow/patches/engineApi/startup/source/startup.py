from __future__ import annotations

import os
import stat
from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, FastAPI
from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator

CONFIG_ENV = "TRELLIS_ENGINE_API_CONFIG_FILE"
CAPTURE_DIRECTORY = Path("/data/config/trellis-capture")
RUNTIME_STATE = "trellis_engine_api_runtime"


class EngineApiStartupConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    version: Literal[1]
    engine_package_digest: str = Field(alias="enginePackageDigest", pattern=r"^[0-9a-f]{64}$")
    component_manifest_hash: str = Field(alias="componentManifestHash", pattern=r"^[0-9a-f]{64}$")
    engine_commit: str = Field(alias="engineCommit", pattern=r"^[0-9a-f]{40}$")
    catalog_path: Path = Field(alias="catalogPath")
    trellis_root: Path = Field(alias="trellisRoot")
    engine_root: Path = Field(alias="engineRoot")
    user_id: UUID = Field(alias="userId")
    export_root: Path = Field(alias="exportRoot")
    native_reservation_origin: AnyHttpUrl = Field(alias="nativeReservationOrigin")
    native_reservation_authentication_file: Path = Field(alias="nativeReservationAuthenticationFile")

    @field_validator("native_reservation_origin")
    @classmethod
    def require_origin(cls, value: AnyHttpUrl) -> AnyHttpUrl:
        if value.username is not None or value.password is not None or value.path != "/" or value.query or value.fragment:
            raise ValueError("native_reservation_origin_invalid")
        return value


def _private_file(path: Path) -> Path:
    if not path.is_absolute():
        raise ValueError("engine_api_config_path_not_absolute")
    metadata = path.lstat()
    if (path.is_symlink() or not stat.S_ISREG(metadata.st_mode)
            or stat.S_IMODE(metadata.st_mode) != 0o600 or metadata.st_uid != os.getuid()):
        raise ValueError("engine_api_config_file_not_private")
    return path.resolve(strict=True)


def _private_directory(path: Path) -> Path:
    if not path.is_absolute():
        raise ValueError("engine_api_directory_not_absolute")
    path.mkdir(mode=0o700, exist_ok=True)
    metadata = path.lstat()
    if (path.is_symlink() or not stat.S_ISDIR(metadata.st_mode)
            or stat.S_IMODE(metadata.st_mode) != 0o700 or metadata.st_uid != os.getuid()):
        raise ValueError("engine_api_directory_not_private")
    return path.resolve(strict=True)


def _sealed_path(path: Path, *, directory: bool) -> Path:
    if not path.is_absolute() or path.is_symlink():
        raise ValueError("engine_api_package_path_invalid")
    resolved = path.resolve(strict=True)
    if (directory and not resolved.is_dir()) or (not directory and not resolved.is_file()):
        raise ValueError("engine_api_package_path_invalid")
    return resolved


def load_engine_api_startup_config() -> EngineApiStartupConfig | None:
    path = os.environ.get(CONFIG_ENV)
    if path is None:
        return None
    source = _private_file(Path(path))
    return EngineApiStartupConfig.model_validate_json(source.read_bytes(), strict=True)


class _CaptureAuthorityBoundary:
    def __init__(self, boundary, after_revoke):
        self.boundary = boundary
        self.store = boundary.store
        self.after_revoke = after_revoke

    async def commit(self, grant_bytes: str):
        return await self.boundary.commit(grant_bytes)

    async def revoke(self, grant_id: UUID, grant_bytes: str):
        receipt = await self.boundary.revoke(grant_id, grant_bytes)
        await self.after_revoke()
        return receipt


class EngineApiRuntime:
    def __init__(self, *, router: APIRouter, start):
        self.router = router
        self._start = start

    async def start(self) -> None:
        await self._start()


def _package(config: EngineApiStartupConfig):
    from langflow.services.trellis_publications.contracts import InstalledPublicationPackage

    return InstalledPublicationPackage(
        engine_package_digest=config.engine_package_digest,
        component_manifest_hash=config.component_manifest_hash,
        engine_commit=config.engine_commit,
        catalog_path=_sealed_path(config.catalog_path, directory=False),
        trellis_root=_sealed_path(config.trellis_root, directory=True),
        engine_root=_sealed_path(config.engine_root, directory=True),
        user_id=str(config.user_id),
    )


def create_engine_api_runtime(config: EngineApiStartupConfig) -> EngineApiRuntime:
    from langflow.api.v1.trellis_publications import create_publication_router
    from langflow.services.deps import (
        get_background_execution_service,
        get_db_service,
        get_job_service,
        get_settings_service,
        session_scope,
    )
    from langflow.services.trellis_v1.admission_router import create_admission_router
    from langflow.services.trellis_v1.admission_service import AdmissionService
    from langflow.services.trellis_v1.backup_router import create_backup_router
    from langflow.services.trellis_v1.cancellation_effects import replay_cancellations
    from langflow.services.trellis_v1.cancellation_router import create_cancellation_router
    from langflow.services.trellis_v1.capture_boundary import CaptureBoundary
    from langflow.services.trellis_v1.capture_grants import CaptureIdentity
    from langflow.services.trellis_v1.capture_router import create_capture_authority_router
    from langflow.services.trellis_v1.capture_store import CaptureGrantStore
    from langflow.services.trellis_v1.capture_writer import install_capture_boundary
    from langflow.services.trellis_v1.decision_api import create_decision_router
    from langflow.services.trellis_v1.engine_api import (
        EngineApiSecurity,
        create_engine_api_router,
        load_engine_api_identity,
    )
    from langflow.services.trellis_v1.native_router import create_native_router
    from langflow.services.trellis_v1.occurrence_transport import install_request_transport

    identity = load_engine_api_identity()
    store = CaptureGrantStore(
        _private_directory(CAPTURE_DIRECTORY),
        CaptureIdentity(
            dataHomeId=identity.data_home_id,
            hostId=identity.host_id,
            ownerId=identity.owner_id,
            instanceId=identity.instance_id,
            manifestDigest=identity.manifest_digest,
        ),
    )
    boundary = CaptureBoundary(store)
    install_capture_boundary(boundary)
    install_request_transport(
        origin=str(config.native_reservation_origin).removesuffix("/"),
        authentication_file=_private_file(config.native_reservation_authentication_file),
    )

    authentication_file = Path(os.environ["TRELLIS_AUTHENTICATION_FILE"])
    capture_issuer_file = Path(os.environ["TRELLIS_CAPTURE_ISSUER_FILE"])
    security = EngineApiSecurity(authentication_file=authentication_file, identity=identity)
    database = get_db_service()
    settings = get_settings_service()
    jobs = get_job_service()
    background = get_background_execution_service()
    publication = _package(config)
    capture_authority = _CaptureAuthorityBoundary(boundary, background.resume_after_capture)

    domain_routers = [
        create_publication_router(publication, require_transport_auth=security.require_transport_auth),
        create_admission_router(
            service=AdmissionService(jobs=jobs, background=background, host_id=identity.host_id),
            security=security,
        ),
        create_decision_router(security=security, execution_service=background),
        create_native_router(jobs=jobs, executor=background, security=security, open_session=session_scope),
        create_cancellation_router(security=security, sessions=session_scope, background=background),
        create_backup_router(
            database=database,
            settings=settings,
            export_root=_private_directory(config.export_root),
            authentication_file=authentication_file,
            package_digest=config.engine_package_digest,
            data_home_id=identity.data_home_id,
            host_id=identity.host_id,
            snapshot_boundary=boundary.snapshot,
        ),
        create_capture_authority_router(boundary=capture_authority, issuer_file=capture_issuer_file),
    ]
    async def start() -> None:
        await replay_cancellations(session_scope, background)
        await background.resume_after_capture()

    return EngineApiRuntime(
        router=create_engine_api_router(
            security=security,
            authority_session=session_scope,
            domain_routers=domain_routers,
        ),
        start=start,
    )


def configure_engine_api(app: FastAPI) -> None:
    config = load_engine_api_startup_config()
    if config is None:
        return
    runtime = create_engine_api_runtime(config)
    setattr(app.state, RUNTIME_STATE, runtime)
    app.include_router(runtime.router)


async def start_engine_api(app: FastAPI) -> None:
    runtime = getattr(app.state, RUNTIME_STATE, None)
    if runtime is not None:
        await runtime.start()
