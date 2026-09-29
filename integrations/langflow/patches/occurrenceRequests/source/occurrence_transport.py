from dataclasses import dataclass
from pathlib import Path

from integrations.langflow.components.catalog.nativeRequest.nativeRequest import request_native_attempt


@dataclass(frozen=True)
class RequestTransport:
    origin: str
    authentication_file: Path

    async def reserve(self, request_bytes: str, capability_id: str) -> str:
        return await request_native_attempt(
            request_bytes, origin=self.origin, authentication_file=self.authentication_file,
            capability_id=capability_id,
        )


_transport: RequestTransport | None = None


def install_request_transport(*, origin: str, authentication_file: Path) -> None:
    global _transport
    _transport = RequestTransport(origin, authentication_file)


def request_transport() -> RequestTransport:
    if _transport is None:
        raise RuntimeError("native_request_transport_not_installed")
    return _transport
