from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.runtime_flags import apply_runtime_flags, flags_path, save_flags


def test_get_config_when_auth_off():
    client = TestClient(app)
    response = client.get("/config")
    assert response.status_code == 200
    body = response.json()
    assert body["auth_required"] is False
    assert body["layers"]["memory"] is False
    assert "keys" in body["restart_for"]
    assert "MEMORY_EMBEDDER" in body["restart_for"]


def test_patch_config_forbidden_without_gateway_key():
    client = TestClient(app)
    response = client.patch("/config", json={"layers": {"memory": True}})
    assert response.status_code == 403
    assert response.json()["detail"]["error"] == "gateway_key_required"


def test_patch_config_requires_valid_bearer(monkeypatch):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    client = TestClient(app)
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
    stored = flags_path().read_text()
    assert '"PII": true' in stored
    assert '"MEMORY": true' in stored


def test_apply_runtime_flags_sets_environ(monkeypatch):
    monkeypatch.setenv("MEMORY", "0")
    save_flags({"MEMORY": True, "GUARD": False})
    apply_runtime_flags()
    assert ( __import__("os").getenv("MEMORY") or "" ).strip() == "1"
    assert ( __import__("os").getenv("GUARD") or "" ).strip() == "0"


def test_load_flags_ignores_bad_file(tmp_path, monkeypatch):
    import app.runtime_flags as runtime_flags

    monkeypatch.setattr(runtime_flags, "_FLAGS_PATH", tmp_path / "runtime-flags.json")
    runtime_flags.flags_path().write_text("{not json")
    assert runtime_flags.load_flags() == {}
    runtime_flags.flags_path().write_text("[]")
    assert runtime_flags.load_flags() == {}
    runtime_flags.flags_path().write_text('{"MEMORY": "yes", "PII": false, "NOPE": true}')
    loaded = runtime_flags.load_flags()
    assert loaded["MEMORY"] is True
    assert loaded["PII"] is False
    assert "NOPE" not in loaded


def test_tri_flag_unknown_returns_default(monkeypatch):
    from app.runtime_flags import layer_state

    monkeypatch.setenv("GUARD_INJECTION", "maybe")
    monkeypatch.setenv("GUARD_CONTENT", "0")
    state = layer_state()
    assert state["guard_injection"] is True
    assert state["guard_content"] is False
    monkeypatch.setenv("GUARD_INJECTION", "yes")
    assert layer_state()["guard_injection"] is True


def test_overlay_survives_reload(monkeypatch):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    client = TestClient(app)
    headers = {"Authorization": "Bearer secret-gateway"}
    client.patch("/config", json={"layers": {"guard": True, "guard_injection": False}}, headers=headers)
    apply_runtime_flags()
    again = client.get("/config", headers=headers)
    assert again.json()["layers"]["guard"] is True
    assert again.json()["layers"]["guard_injection"] is False
