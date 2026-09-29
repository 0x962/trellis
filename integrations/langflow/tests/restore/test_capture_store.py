from __future__ import annotations

import hashlib
import json
from uuid import uuid4

import pytest

from langflow.services.trellis_v1.capture_grants import CaptureConflict, CaptureIdentity, parse_grant
from langflow.services.trellis_v1.capture_store import CaptureGrantStore


@pytest.fixture
def capture_store(tmp_path):
    directory = tmp_path / "capture-control"
    directory.mkdir(mode=0o700)
    identity = CaptureIdentity(dataHomeId=uuid4(), hostId=uuid4(), ownerId=uuid4(), instanceId=uuid4(),
                               manifestDigest="a" * 64)
    return CaptureGrantStore(directory, identity)


def grant_bytes(store, generation=1):
    snapshot = str(uuid4())
    return json.dumps({
        "version": 1,
        "id": str(uuid4()),
        "block": {
            "id": str(uuid4()), "dataHomeId": str(store.identity.dataHomeId),
            "generation": generation, "requestId": "capture-α", "reason": {"kind": "capture", "snapshotId": snapshot},
        },
        "identity": store.identity.model_dump(mode="json"),
        "snapshotId": snapshot,
        "boundaryReceiptId": "drained-receipt",
    }, ensure_ascii=False)


def test_retains_exact_bytes_and_revocation_after_reopen(capture_store):
    original = grant_bytes(capture_store)
    grant = parse_grant(original)
    receipt = capture_store.commit(original)
    expected = json.dumps({"grantBytes": original, "state": "active"}, ensure_ascii=False, separators=(",", ":"))
    assert receipt.receiptId == hashlib.sha256(expected.encode()).hexdigest()
    reopened = CaptureGrantStore(capture_store.directory, capture_store.identity)
    assert reopened.read(grant.id) == receipt
    assert reopened.commit(original) == receipt
    revoked = reopened.revoke(grant.id, original)
    assert revoked.state == "revoked"
    assert reopened.commit(original) == revoked
    assert CaptureGrantStore(capture_store.directory, capture_store.identity).read(grant.id) == revoked


def test_unknown_revoke_prevents_delayed_commit(capture_store):
    original = grant_bytes(capture_store, generation=3)
    grant = parse_grant(original)
    revoked = capture_store.revoke(grant.id, original)
    assert capture_store.commit(original) == revoked
    with pytest.raises(CaptureConflict, match="generation_stale"):
        capture_store.commit(grant_bytes(capture_store, generation=2))
    assert capture_store.commit(grant_bytes(capture_store, generation=4)).state == "active"


def test_refuses_replacement_and_changed_bytes(capture_store):
    original = grant_bytes(capture_store)
    grant = parse_grant(original)
    capture_store.commit(original)
    with pytest.raises(CaptureConflict, match="already_active"):
        capture_store.commit(grant_bytes(capture_store, generation=2))
    changed = original + " "
    with pytest.raises(CaptureConflict, match="bytes_conflict"):
        capture_store.commit(changed)
    with pytest.raises(CaptureConflict, match="bytes_conflict"):
        capture_store.revoke(grant.id, changed)
    assert capture_store.read(grant.id).state == "active"


def test_refuses_foreign_identity_and_scope(capture_store):
    value = json.loads(grant_bytes(capture_store))
    value["identity"]["instanceId"] = str(uuid4())
    with pytest.raises(CaptureConflict, match="identity_conflict"):
        capture_store.commit(json.dumps(value))
    value["block"]["reason"]["snapshotId"] = "changed"
    with pytest.raises(ValueError, match="scope_conflict"):
        parse_grant(json.dumps(value))


@pytest.mark.parametrize("change", ["duplicate", "boolean", "float", "extra"])
def test_rejects_ambiguous_grant_json(capture_store, change):
    original = grant_bytes(capture_store)
    value = json.loads(original)
    if change == "duplicate":
        original = original.replace('"version": 1', '"version": 1, "version": 1')
    else:
        if change == "boolean":
            value["block"]["generation"] = True
        if change == "float":
            value["block"]["generation"] = 1.0
        if change == "extra":
            value["callerAuthority"] = True
        original = json.dumps(value)
    with pytest.raises(ValueError):
        parse_grant(original)


def test_successor_revokes_retired_instance_without_activation(capture_store):
    original = grant_bytes(capture_store)
    grant = parse_grant(original)
    capture_store.commit(original)
    successor = CaptureGrantStore(capture_store.directory, capture_store.identity.model_copy(update={
        "instanceId": uuid4(), "ownerId": uuid4(), "manifestDigest": "b" * 64,
    }))
    with pytest.raises(CaptureConflict, match="runtime_identity_conflict"):
        successor.commit(original)
    with pytest.raises(CaptureConflict, match="runtime_identity_conflict"):
        successor.read(grant.id)
    revoked = successor.revoke(grant.id, original)
    assert revoked.state == "revoked"
    assert successor.read(grant.id) == revoked
    assert capture_store.commit(original) == revoked
    unknown = grant_bytes(capture_store, generation=2)
    tombstone = successor.revoke(parse_grant(unknown).id, unknown)
    assert capture_store.commit(unknown) == tombstone
    assert successor.commit(grant_bytes(successor, generation=3)).state == "active"


@pytest.mark.parametrize("field", ["hostId", "dataHomeId"])
def test_revoke_rejects_another_home_or_host(capture_store, field):
    original = grant_bytes(capture_store)
    grant = parse_grant(original)
    capture_store.commit(original)
    foreign = CaptureGrantStore(capture_store.directory, capture_store.identity.model_copy(update={field: uuid4()}))
    with pytest.raises(CaptureConflict, match="home_identity_conflict"):
        foreign.revoke(grant.id, original)
    assert capture_store.read(grant.id).state == "active"
