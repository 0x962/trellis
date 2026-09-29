from typing import Literal

from pydantic import BaseModel, ConfigDict

from langflow.services.trellis_v1.native_protocol import Reference, Revision, Uuid, read_json


class NativeHandle(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: Literal[1]
    stepId: Reference
    agentRunId: Reference
    attemptId: Uuid
    workspaceId: Reference | None
    providerSessionId: Reference | None
    state: Literal["reserved", "launching", "running", "waiting_native", "unknown", "succeeded", "failed", "canceled"]
    revision: Revision


def validate_handle(handle_bytes: str) -> None:
    NativeHandle.model_validate(read_json(handle_bytes))
