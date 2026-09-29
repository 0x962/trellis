from pathlib import Path
from types import SimpleNamespace

from langflow.services.trellis_v1.startup import _install_outgoing_transports, create_engine_api_runtime


def test_outgoing_transports_share_the_current_instance_credential(tmp_path: Path):
    credential = tmp_path / "native-reservations.token"
    credential.write_text("current-instance-token")
    credential.chmod(0o600)
    calls = []

    def install_native(**input):
        calls.append(("native", input))

    def install_review(**input):
        calls.append(("review", input))

    _install_outgoing_transports(
        SimpleNamespace(
            native_reservation_origin="http://host.docker.internal:4521/",
            native_reservation_authentication_file=credential,
        ),
        install_request_transport=install_native,
        install_review_gate_transport=install_review,
    )

    expected = {
        "origin": "http://host.docker.internal:4521",
        "authentication_file": credential,
    }
    assert calls == [("native", expected), ("review", expected)]


def test_runtime_registers_one_review_router():
    names = create_engine_api_runtime.__code__.co_names
    assert names.count("create_review_gate_router") == 1
    assert names.count("create_projection_router") == 1
