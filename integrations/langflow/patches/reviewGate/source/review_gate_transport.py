from dataclasses import dataclass
from pathlib import Path

from integrations.langflow.components.jevGate.client import invoke_review_gate, read_review_context


@dataclass(frozen=True)
class ReviewGateTransport:
    origin: str
    authentication_file: Path

    async def context(self, request_bytes, *, authority_bytes, capability_id):
        return await read_review_context(request_bytes, origin=self.origin, authentication_file=self.authentication_file,
                                         authority_bytes=authority_bytes, capability_id=capability_id)

    async def invoke(self, request_bytes, *, authority_bytes, capability_id):
        return await invoke_review_gate(request_bytes, origin=self.origin, authentication_file=self.authentication_file,
                                        authority_bytes=authority_bytes, capability_id=capability_id)


_transport: ReviewGateTransport | None = None


def install_review_gate_transport(*, origin: str, authentication_file: Path) -> None:
    global _transport
    _transport = ReviewGateTransport(origin, authentication_file)


def review_gate_transport() -> ReviewGateTransport:
    if _transport is None:
        raise RuntimeError("review_gate_transport_not_installed")
    return _transport
