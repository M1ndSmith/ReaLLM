from __future__ import annotations

from fastapi.testclient import TestClient


def test_get_config_when_auth_off(client):
    response = client.get("/config")
    assert response.status_code == 200
    body = response.json()
    assert body["auth_required"] is False
    assert body["layers"]["memory"] is False
    assert "keys" in body["restart_for"]
    assert "MEMORY_EMBEDDER" in body["restart_for"]


def test_patch_config_forbidden_without_gateway_key(client):
    response = client.patch("/config", json={"layers": {"memory": True}})
    assert response.status_code == 403
    assert response.json()["detail"]["error"] == "gateway_key_required"


def test_patch_config_requires_valid_bearer(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    client = TestClient(make_app())
    denied = client.patch("/config", json={"layers": {"pii": True}})
    assert denied.status_code == 401
    ok = client.patch(
        "/config",
        json={"layers": {"pii": True, "memory": True, "guard": False}},
        headers={"Authorization": "Bearer secret-gateway"},
    )
    assert ok.status_code == 200
    layers = ok.json()["layers"]
    assert layers["pii"] is True
    assert layers["memory"] is True
    assert layers["guard"] is False
    stored = client.app.state.runtime.flags.path().read_text()
    assert '"PII": true' in stored
    assert '"MEMORY": true' in stored


def test_patch_does_not_mutate_environ(monkeypatch, make_app):
    import os

    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    monkeypatch.setenv("MEMORY", "0")
    client = TestClient(make_app())
    client.patch(
        "/config",
        json={"layers": {"memory": True}},
        headers={"Authorization": "Bearer secret-gateway"},
    )
    assert (os.getenv("MEMORY") or "").strip() == "0"
    assert client.app.state.runtime.flags.snapshot().memory is True


def test_load_flags_ignores_bad_file(tmp_path, monkeypatch):
    from app.infrastructure.flags import RuntimeFlagStore
    from app.settings import GatewaySettings

    path = tmp_path / "runtime-flags.json"
    store = RuntimeFlagStore(GatewaySettings(), path)
    path.write_text("{not json")
    store.load()
    assert store.snapshot().memory is False
    path.write_text("[]")
    store.load()
    assert store.snapshot().memory is False
    path.write_text('{"MEMORY": "yes", "PII": false, "NOPE": true}')
    store.load()
    snap = store.snapshot()
    assert snap.memory is True
    assert snap.pii is False


def test_tri_flag_unknown_returns_default(monkeypatch, tmp_path):
    from app.infrastructure.flags import RuntimeFlagStore
    from app.settings import GatewaySettings

    monkeypatch.setenv("GUARD_INJECTION", "maybe")
    monkeypatch.setenv("GUARD_CONTENT", "0")
    store = RuntimeFlagStore(GatewaySettings(), tmp_path / "runtime-flags.json")
    state = store.snapshot()
    assert state.guard_injection is True
    assert state.guard_content is False
    monkeypatch.setenv("GUARD_INJECTION", "yes")
    store = RuntimeFlagStore(GatewaySettings(), tmp_path / "runtime-flags-2.json")
    assert store.snapshot().guard_injection is True


def test_overlay_survives_reload(monkeypatch, make_app, tmp_path):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    client = TestClient(make_app())
    headers = {"Authorization": "Bearer secret-gateway"}
    client.patch("/config", json={"layers": {"guard": True, "guard_injection": False}}, headers=headers)
    from tests.factories import app_for

    data_dir = client.app.state.runtime.flags.path().parent
    again_app = app_for(data_dir)
    again = TestClient(again_app)
    body = again.get("/config", headers=headers).json()
    assert body["layers"]["guard"] is True
    assert body["layers"]["guard_injection"] is False


def test_snapshot_stable_during_patch(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    app = make_app()
    snap = app.state.runtime.flags.snapshot()
    TestClient(app).patch(
        "/config",
        json={"layers": {"memory": True}},
        headers={"Authorization": "Bearer secret-gateway"},
    )
    assert snap.memory is False
    assert app.state.runtime.flags.snapshot().memory is True
