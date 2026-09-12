from __future__ import annotations

from fastapi.testclient import TestClient


def test_admin_list_and_create(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    client = TestClient(make_app())
    headers = {"Authorization": "Bearer secret-gateway"}
    listed = client.get("/admin/keys", headers=headers)
    assert listed.status_code == 200
    assert any(item["id"] == "default" for item in listed.json()["keys"])
    created = client.post(
        "/admin/keys",
        headers=headers,
        json={"key_id": "agent", "scopes": ["read", "chat"], "label": "Agent"},
    )
    assert created.status_code == 200
    body = created.json()
    assert body["key"]["id"] == "agent"
    assert body["secret"]
    assert "secret_hash" not in str(body)
    again = client.get("/admin/keys", headers=headers).json()
    assert any(item["id"] == "agent" for item in again["keys"])
    assert "secret" not in str(again)


def test_admin_scope_required(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    app = make_app()
    identity, issued = app.state.runtime.identities.create(key_id="chat-only", scopes=["chat"], label="Chat")
    assert identity.id == "chat-only"
    client = TestClient(app)
    denied = client.get("/admin/keys", headers={"Authorization": f"Bearer {issued}"})
    assert denied.status_code == 403
    assert denied.json()["detail"]["error"] == "forbidden"
    assert denied.json()["detail"]["required_scope"] == "admin"


def test_admin_patch_and_revoke(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    client = TestClient(make_app())
    headers = {"Authorization": "Bearer secret-gateway"}
    created = client.post(
        "/admin/keys",
        headers=headers,
        json={"key_id": "worker", "scopes": ["chat"], "label": "Worker", "quotas": {"rpm": 9}},
    )
    assert created.status_code == 200
    secret = created.json()["secret"]
    patched = client.patch(
        "/admin/keys/worker",
        headers=headers,
        json={"scopes": ["read", "chat"], "label": "Worker 2", "quotas": {"daily_token_budget": 20, "rpm": 3}},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["scopes"] == ["read", "chat"]
    assert body["label"] == "Worker 2"
    assert body["quotas"]["rpm"] == 3
    revoked = client.delete("/admin/keys/worker", headers=headers)
    assert revoked.status_code == 200
    assert revoked.json()["revoked_at"] is not None
    listed = client.get("/admin/keys", headers=headers, params={"include_revoked": True}).json()
    assert any(item["id"] == "worker" and item["revoked_at"] for item in listed["keys"])
    denied = client.get("/health", headers={"Authorization": f"Bearer {secret}"})
    assert denied.status_code == 401


def test_admin_unknown_key_is_400(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    client = TestClient(make_app())
    headers = {"Authorization": "Bearer secret-gateway"}
    missing = client.patch("/admin/keys/missing", headers=headers, json={"label": "x"})
    assert missing.status_code == 400
