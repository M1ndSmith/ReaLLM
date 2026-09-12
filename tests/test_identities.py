from __future__ import annotations

import json

import pytest

from app.application.models import IdentityQuotas
from app.infrastructure.identities import ALL_SCOPES, GatewayIdentityStore
from app.settings import GatewaySettings


def test_bootstrap_from_gateway_api_key(monkeypatch, tmp_path):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    store = GatewayIdentityStore(GatewaySettings(), tmp_path / "gateway-keys.json")
    assert store.auth_enabled() is True
    path = tmp_path / "gateway-keys.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert "default" in payload["keys"]
    identity = store.resolve("secret-gateway")
    assert identity is not None
    assert identity.id == "default"
    assert tuple(identity.scopes) == ALL_SCOPES


def test_create_patch_and_revoke(monkeypatch, tmp_path):
    monkeypatch.delenv("GATEWAY_API_KEY", raising=False)
    store = GatewayIdentityStore(GatewaySettings(), tmp_path / "gateway-keys.json")
    identity, secret = store.create(key_id="agent-a", scopes=["read", "chat"], label="Agent A")
    assert identity.id == "agent-a"
    assert secret
    resolved = store.resolve(secret)
    assert resolved is not None and resolved.id == "agent-a"
    patched = store.patch(key_id="agent-a", scopes=["read"], revoked=False)
    assert patched.scopes == ("read",)
    revoked = store.revoke("agent-a")
    assert revoked.revoked_at is not None
    assert store.resolve(secret) is None


def test_auth_enabled_with_multi_key_off_uses_legacy_gateway_key(monkeypatch, tmp_path):
    monkeypatch.setenv("GATEWAY_MULTI_KEY", "0")
    monkeypatch.delenv("GATEWAY_API_KEY", raising=False)
    store = GatewayIdentityStore(GatewaySettings(), tmp_path / "gateway-keys-off.json")
    assert store.auth_enabled() is False

    monkeypatch.setenv("GATEWAY_API_KEY", "legacy-key")
    legacy = GatewayIdentityStore(GatewaySettings(), tmp_path / "gateway-keys-legacy.json")
    assert legacy.auth_enabled() is True
    identity = legacy.resolve("legacy-key")
    assert identity is not None
    assert identity.id == "default"
    assert identity.scopes == ALL_SCOPES


def test_create_and_patch_validation_errors(monkeypatch, tmp_path):
    monkeypatch.delenv("GATEWAY_API_KEY", raising=False)
    store = GatewayIdentityStore(GatewaySettings(), tmp_path / "gateway-keys-errors.json")

    with pytest.raises(ValueError, match="key_id is required"):
        store.create(key_id=" ", scopes=["chat"])
    with pytest.raises(ValueError, match="At least one valid scope is required"):
        store.create(key_id="agent-a", scopes=["invalid"])

    store.create(key_id="agent-a", scopes=["chat"])
    with pytest.raises(ValueError, match="already exists"):
        store.create(key_id="agent-a", scopes=["chat"])
    with pytest.raises(ValueError, match="Unknown key"):
        store.patch(key_id="unknown")
    with pytest.raises(ValueError, match="At least one valid scope is required"):
        store.patch(key_id="agent-a", scopes=["invalid"])


def test_load_normalizes_scopes_and_quotas(monkeypatch, tmp_path):
    monkeypatch.delenv("GATEWAY_API_KEY", raising=False)
    path = tmp_path / "gateway-keys-normalize.json"
    payload = {
        "version": 1,
        "keys": {
            "agent-z": {
                "secret_hash": "sha256:abc",
                "scopes": ["CHAT", "chat", "admin", "invalid", 7],
                "label": "Agent Z",
                "created_at": "2026-01-01T00:00:00Z",
                "revoked_at": None,
                "last_used_at": None,
                "quotas": {"daily_token_budget": "12", "daily_usd_budget": "1.5", "rpm": "-2"},
            }
        },
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    store = GatewayIdentityStore(GatewaySettings(), path)
    identity = store.get("agent-z")
    assert identity is not None
    assert identity.scopes == ("chat", "admin")
    assert identity.quotas.daily_token_budget == 12
    assert identity.quotas.daily_usd_budget == 1.5
    assert identity.quotas.rpm_limit is None


def test_public_payload_respects_revocation_and_quotas(monkeypatch, tmp_path):
    monkeypatch.delenv("GATEWAY_API_KEY", raising=False)
    store = GatewayIdentityStore(GatewaySettings(), tmp_path / "gateway-keys-public.json")
    identity, _secret = store.create(
        key_id="agent-q",
        scopes=["chat", "read"],
        quotas=IdentityQuotas(daily_token_budget=100, daily_usd_budget=1.25, rpm_limit=9),
    )
    quotas = store.quotas_for(identity.id)
    assert quotas.daily_token_budget == 100
    assert quotas.daily_usd_budget == 1.25
    assert quotas.rpm_limit == 9
    assert store.quotas_for("missing").rpm_limit is None

    store.revoke(identity.id)
    visible = store.public_payload()
    assert all(item["id"] != identity.id for item in visible)
    all_rows = store.public_payload(include_revoked=True)
    revoked = next(item for item in all_rows if item["id"] == identity.id)
    assert revoked["revoked_at"] is not None


def test_resolve_debounces_last_used_persist(monkeypatch, tmp_path):
    monkeypatch.delenv("GATEWAY_API_KEY", raising=False)
    path = tmp_path / "gateway-keys-last-used.json"
    store = GatewayIdentityStore(GatewaySettings(), path)
    _identity, secret = store.create(key_id="agent-lu", scopes=["chat"])
    first = store.resolve(secret)
    assert first is not None
    text_after_first = path.read_text(encoding="utf-8")
    assert '"last_used_at"' in text_after_first
    second = store.resolve(secret)
    assert second is not None
    assert path.read_text(encoding="utf-8") == text_after_first
    assert store.get("agent-lu") is not None
    assert store.get("agent-lu").last_used_at == second.last_used_at
