import hashlib
import json
from pathlib import Path

import httpx

from .protocol import read_review_response, read_review_visit


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def private_request(path, request_bytes, *, authority_bytes, origin, authentication_file, capability_id):
    bearer = Path(authentication_file).read_bytes().decode("utf-8")
    if not bearer:
        raise ValueError("review_gate_bearer_required")
    async with httpx.AsyncClient(trust_env=False, follow_redirects=False, timeout=None) as client:
        response = await client.post(
            f"{origin.rstrip('/')}/api/langflow-private/v1/review-gates{path}",
            json={"requestBytes": request_bytes, "authorityBytes": authority_bytes},
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {bearer}",
                     "X-Trellis-Capability-Id": capability_id},
        )
        response.raise_for_status()
        return response.text


async def invoke_review_gate(request_bytes: str, **options) -> str:
    request = read_review_visit(request_bytes)
    raw = await private_request("", request_bytes, **options)
    response = read_review_response(raw)
    if response.visitDigest != digest(request_bytes) or response.visit != request:
        raise ValueError("review_gate_response_binding_conflict")
    return raw


async def read_review_context(request_bytes: str, **options) -> str:
    raw = json.loads(await private_request("/context", request_bytes, **options))
    if (set(raw) != {"version", "requestBytes", "requestDigest", "authorityDigest"} or raw["version"] != 1
            or raw["requestDigest"] != digest(raw["requestBytes"])
            or raw["authorityDigest"] != digest(options["authority_bytes"])):
        raise ValueError("review_context_response_conflict")
    request, shared = json.loads(request_bytes), json.loads(raw["requestBytes"])
    if any(shared[field] != request[field] for field in ("executionId", "publicationId", "engineJobId", "classificationRequestId")):
        raise ValueError("review_context_binding_conflict")
    return raw["requestBytes"]
