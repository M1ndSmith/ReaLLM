from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from tests.factories import PROMPTS_DIR
from tests.fakes import FakeResponse

from app.application.billing import BillingCoordinator
from app.application.errors import BillingUnavailableError, BudgetExceededError
from app.application.models import BillingLineItem, BillingSubject, IdentityQuotas
from app.bootstrap import build_runtime
from app.infrastructure.arc_usdc import ArcUsdcReader
from app.infrastructure.arc_wallet import FAUCET_URL, address_from_private_key, keccak256, load_or_create_wallet
from app.infrastructure.billing_gateway import BillingGateway
from app.infrastructure.billing_noop import NoopBilling
from app.infrastructure.billing_store import BillingStore
from app.infrastructure.usage_audit import UsageAuditLog
from app.settings import GatewaySettings


def _settings(monkeypatch, **env: str) -> GatewaySettings:
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return GatewaySettings()


def test_billing_store_hold_settle_and_totals(monkeypatch, tmp_path):
    settings = _settings(monkeypatch, BILLING_MODE="hybrid", BILLING_PREPAID_REQUIRED="1")
    store = BillingStore(settings, state_path=tmp_path / "billing-state.json")
    quotas = IdentityQuotas(team_id="team-a", team_daily_usd_cap=10.0, prepaid_required=True, max_per_call_usd=5.0)
    subject = store.subject_for("id-a", quotas)

    store.patch_team_policy(team_id="team-a", prepaid_balance_usdc=9.0)
    store.assert_can_spend(subject, 2.0, quotas=quotas)

    hold_id = store.hold(subject=subject, estimated_usd=2.0, idempotency_key="k1")
    assert hold_id is not None
    assert store.hold(subject=subject, estimated_usd=2.0, idempotency_key="k1") == hold_id

    items = [
        BillingLineItem(kind="inference_model_call", usd=1.2),
        BillingLineItem(kind="security_injection_scan", usd=0.15),
    ]
    store.settle(hold_id=hold_id, actual_usd=1.35, idempotency_key="k1", items=items, subject=subject)
    store.settle(hold_id=hold_id, actual_usd=9.0, idempotency_key="k1", items=items, subject=subject)
    store.release(hold_id)

    status = store.status(identity_id="id-a", quotas=quotas)
    assert status.mode == "hybrid"
    assert status.team_id == "team-a"
    assert status.team_daily_spent_usd == pytest.approx(1.35)
    assert status.prepaid_balance_usdc == pytest.approx(7.65)
    assert status.line_item_totals["inference_model_call"] == pytest.approx(1.2)
    assert status.line_item_totals["security_injection_scan"] == pytest.approx(0.15)


def test_billing_store_enforces_caps_and_prepaid(monkeypatch, tmp_path):
    settings = _settings(monkeypatch, BILLING_MODE="wallet", BILLING_PREPAID_REQUIRED="1")
    store = BillingStore(settings, state_path=tmp_path / "billing-state.json")
    quotas = IdentityQuotas(team_id="team-b", team_daily_usd_cap=2.0, prepaid_required=None, max_per_call_usd=0.5)
    subject = store.subject_for("id-b", quotas)
    store.patch_team_policy(team_id="team-b", prepaid_balance_usdc=0.4)

    with pytest.raises(BudgetExceededError, match="Per-call spend cap exceeded"):
        store.assert_can_spend(subject, 0.6, quotas=quotas)
    with pytest.raises(BudgetExceededError, match="Insufficient prepaid balance"):
        store.assert_can_spend(subject, 0.45, quotas=IdentityQuotas(team_id="team-b", prepaid_required=None))

    hold_id = store.hold(subject=subject, estimated_usd=0.3, idempotency_key="kb")
    assert hold_id
    store.settle(
        hold_id=hold_id,
        actual_usd=0.3,
        idempotency_key="kb",
        items=[BillingLineItem(kind="inference_model_call", usd=0.3)],
        subject=subject,
    )
    with pytest.raises(BudgetExceededError, match="Team daily USD cap exceeded"):
        store.assert_can_spend(
            subject,
            1.9,
            quotas=IdentityQuotas(team_id="team-b", team_daily_usd_cap=2.0, prepaid_required=False),
        )


def test_billing_store_rollover_carries_balance(monkeypatch, tmp_path):
    settings = _settings(monkeypatch, BILLING_MODE="shadow")
    state_path = tmp_path / "billing-state.json"
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    state_path.write_text(
        json.dumps(
            {
                "day": yesterday,
                "teams": {"team-c": {"balance_usdc": 4.2, "spent_usd": 8.8}},
                "holds": {"h1": {"team_id": "team-c", "estimated_usd": 1.0}},
                "idempotency": {"ik1": {"hold_id": "h1", "settled": False}},
                "line_item_totals": {"inference_model_call": 9.9},
            }
        ),
        encoding="utf-8",
    )
    store = BillingStore(settings, state_path=state_path)
    quotas = IdentityQuotas(team_id="team-c")
    status = store.status(identity_id="id-c", quotas=quotas)
    assert status.prepaid_balance_usdc == pytest.approx(4.2)
    assert status.team_daily_spent_usd == pytest.approx(0.0)
    assert status.line_item_totals == {}


def test_shadow_mode_does_not_enforce_caps_or_balance(monkeypatch, tmp_path):
    settings = _settings(monkeypatch, BILLING_MODE="shadow", BILLING_PREPAID_REQUIRED="1")
    store = BillingStore(settings, state_path=tmp_path / "billing-state.json")
    quotas = IdentityQuotas(team_id="team-shadow", team_daily_usd_cap=1.0, prepaid_required=True, max_per_call_usd=0.1)
    subject = store.subject_for("id-shadow", quotas)
    store.patch_team_policy(team_id="team-shadow", prepaid_balance_usdc=0.0)

    store.assert_can_spend(subject, 5.0, quotas=quotas)
    hold_id = store.hold(subject=subject, estimated_usd=5.0, idempotency_key="shadow-1")
    store.settle(
        hold_id=hold_id,
        actual_usd=2.5,
        idempotency_key="shadow-1",
        items=[BillingLineItem(kind="inference_model_call", usd=2.5)],
        subject=subject,
    )
    status = store.status(identity_id="id-shadow", quotas=quotas)
    assert status.team_daily_spent_usd == pytest.approx(2.5)
    assert status.prepaid_balance_usdc == pytest.approx(0.0)


def test_wallet_mode_requires_prepaid_even_without_quota_flag(monkeypatch, tmp_path):
    settings = _settings(monkeypatch, BILLING_MODE="wallet", BILLING_PREPAID_REQUIRED="0")
    store = BillingStore(settings, state_path=tmp_path / "billing-state.json")
    quotas = IdentityQuotas(team_id="team-wallet", prepaid_required=False)
    subject = store.subject_for("id-wallet", quotas)
    store.patch_team_policy(team_id="team-wallet", prepaid_balance_usdc=0.25)

    with pytest.raises(BudgetExceededError, match="Insufficient prepaid balance"):
        store.assert_can_spend(subject, 1.0, quotas=quotas)
    with pytest.raises(BudgetExceededError, match="Insufficient prepaid balance at settlement"):
        store.settle(
            hold_id=None,
            actual_usd=0.5,
            idempotency_key="wallet-1",
            items=[BillingLineItem(kind="inference_model_call", usd=0.5)],
            subject=subject,
        )


def test_usage_audit_log_append_list_and_count(tmp_path):
    audit = UsageAuditLog(tmp_path / "usage-audit.jsonl")
    subject = BillingSubject(identity_id="id-1", team_id="team-1")
    audit.append_usage_event(
        idempotency_key="k1",
        subject=subject,
        hold_id="h1",
        model="groq/openai/gpt-oss-20b",
        route="/chat",
        items=[BillingLineItem(kind="inference_model_call", usd=0.2)],
        total_usd=0.2,
        status="captured",
    )
    audit.append_usage_event(
        idempotency_key="k2",
        subject=subject,
        hold_id=None,
        model="groq/openai/gpt-oss-20b",
        route="/v1/embeddings",
        items=[BillingLineItem(kind="inference_model_call", usd=0.1)],
        total_usd=0.1,
        status="failed",
        reason="upstream_error",
    )
    with (tmp_path / "usage-audit.jsonl").open("a", encoding="utf-8") as f:
        f.write("{not-json}\n")

    listed = audit.list_usage_events(offset=0, limit=2)
    assert listed[0]["idempotency_key"] == "k2"
    assert listed[1]["idempotency_key"] == "k1"
    assert audit.list_usage_events(offset=1, limit=1)[0]["idempotency_key"] == "k1"
    assert audit.count() == 3


def test_billing_gateway_reconcile_modes():
    ok = BillingGateway(mode="ledger").reconcile()
    assert ok.ok is True
    assert ok.mode == "ledger"
    fail = BillingGateway(mode="unknown").reconcile()
    assert fail.ok is False
    assert "Unknown" in fail.detail
    missing = BillingGateway(mode="arc").reconcile()
    assert missing.ok is False
    assert "not configured" in missing.detail


def test_noop_billing_status_and_team_policy():
    billing = NoopBilling()
    quotas = IdentityQuotas(team_id="team-noop", team_daily_usd_cap=3.0, prepaid_required=True)
    subject = billing.subject_for("id-noop", quotas)
    assert subject.team_id == "team-noop"
    status = billing.status(identity_id="id-noop", quotas=quotas)
    assert status.mode == "off"
    assert status.team_daily_cap_usd == 3.0
    patched = billing.patch_team_policy(team_id="team-noop", daily_usd_cap=1.0, prepaid_balance_usdc=2.0)
    assert patched["daily_usd_cap"] == 1.0
    assert patched["prepaid_balance_usdc"] == 2.0


def test_billing_coordinator_none_release_noop():
    class _FakeEntitlement:
        def subject_for(self, identity_id, quotas=None):
            return BillingSubject(identity_id=identity_id, team_id="team-x")

        def assert_can_spend(self, subject, estimated_usd, quotas=None):
            return None

    class _FakeHold:
        def hold(self, *, subject, estimated_usd, idempotency_key):
            return "hold-1"

        def release(self, hold_id):
            self.released = hold_id  # noqa: B018

    class _FakeSettle:
        def settle(self, **kwargs):
            self.last = kwargs  # noqa: B018

    class _FakeAudit:
        def append_usage_event(self, **kwargs):
            self.last = kwargs  # noqa: B018

    holds = _FakeHold()
    settles = _FakeSettle()
    audit = _FakeAudit()
    coordinator = BillingCoordinator(
        entitlement=_FakeEntitlement(),
        holds=holds,
        settlement=settles,
        audit=audit,
    )
    coordinator.release(None)
    coordinator.settle(
        reservation=None,
        model="m",
        route="/chat",
        actual_usd=0.0,
        items=[BillingLineItem(kind="inference_model_call", usd=0.0)],
        status="captured",
    )
    reservation = coordinator.pre_authorize(
        identity_id="id-x",
        quotas=IdentityQuotas(team_id="team-x"),
        estimated_usd=0.2,
        request_id="req-1",
        route="/chat",
    )
    coordinator.release(reservation)
    assert getattr(holds, "released") == "hold-1"


def test_billing_routes_end_to_end(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    monkeypatch.setenv("BILLING_MODE", "hybrid")
    app = make_app()
    client = TestClient(app)
    admin_headers = {"Authorization": "Bearer secret-gateway"}

    created = client.post(
        "/admin/keys",
        headers=admin_headers,
        json={
            "key_id": "bill-user",
            "scopes": ["read", "chat"],
            "quotas": {"team_id": "team-z", "team_daily_usd_cap": 5.0},
        },
    )
    assert created.status_code == 200
    issued = created.json()["secret"]
    user_headers = {"Authorization": f"Bearer {issued}"}

    status = client.get("/billing/status", headers=user_headers)
    assert status.status_code == 200
    assert status.json()["mode"] == "hybrid"
    assert status.json()["team_id"] == "team-z"

    quotas = app.state.runtime.identities.quotas_for("bill-user")
    subject = app.state.runtime.billing.subject_for("bill-user", quotas)
    app.state.runtime.billing_audit.append_usage_event(
        idempotency_key="usage-1",
        subject=subject,
        hold_id="h-1",
        model="groq/openai/gpt-oss-20b",
        route="/chat",
        items=[BillingLineItem(kind="inference_model_call", usd=0.25)],
        total_usd=0.25,
        status="captured",
    )
    usage = client.get("/billing/usage?offset=0&limit=10", headers=user_headers)
    assert usage.status_code == 200
    assert usage.json()["total"] >= 1
    assert usage.json()["items"][0]["idempotency_key"] == "usage-1"

    team_get = client.get("/billing/teams/team-z", headers=admin_headers)
    assert team_get.status_code == 200
    team_patch = client.patch(
        "/billing/teams/team-z",
        headers=admin_headers,
        json={"team_id": "team-z", "daily_usd_cap": 9.0, "prepaid_balance_usdc": 4.0, "prepaid_required": True},
    )
    assert team_patch.status_code == 200
    assert team_patch.json()["prepaid_balance_usdc"] == pytest.approx(4.0)
    assert team_patch.json()["daily_usd_cap"] == pytest.approx(9.0)

    reconcile = client.post("/billing/reconcile", headers=admin_headers)
    assert reconcile.status_code == 200
    assert reconcile.json()["ok"] is True


def test_chat_billing_attributes_sidecar_line_items(monkeypatch, make_app):
    monkeypatch.setenv("BILLING_MODE", "hybrid")
    monkeypatch.setenv("MEMORY", "1")
    monkeypatch.setenv("PII", "1")
    monkeypatch.setenv("GUARD", "1")
    monkeypatch.setenv("BILLING_SECURITY_INJECTION_USD", "0.02")
    monkeypatch.setenv("BILLING_SECURITY_CONTENT_USD", "0.03")
    monkeypatch.setenv("BILLING_MEMORY_RETRIEVE_USD", "0.04")
    monkeypatch.setenv("BILLING_MEMORY_RECORD_USD", "0.05")
    monkeypatch.setenv("BILLING_PII_BASE_USD", "0.06")
    monkeypatch.setenv("BILLING_PII_ENTITY_USD", "0.01")
    app = make_app()

    async def fake_complete(**kwargs):
        return FakeResponse("ok")

    async def fake_redact_messages(messages):
        return messages, ["EMAIL_ADDRESS", "PHONE_NUMBER"]

    async def fake_redact_text(text):
        return text, ["EMAIL_ADDRESS", "PHONE_NUMBER"]

    async def fake_attach(messages, flags, user_id, conversation_id, agent_id):
        return list(messages), 1

    async def no_guard(*args, **kwargs):
        return None

    monkeypatch.setattr(app.state.runtime.router, "acompletion", fake_complete)
    monkeypatch.setattr(app.state.runtime.budget, "completion_usd", lambda *_a, **_k: 0.4)
    monkeypatch.setattr(app.state.runtime.pii, "redact_messages", fake_redact_messages)
    monkeypatch.setattr(app.state.runtime.pii, "redact_text", fake_redact_text)
    monkeypatch.setattr(app.state.runtime.memory, "attach", fake_attach)
    monkeypatch.setattr(app.state.runtime.memory, "schedule_record", lambda *args, **kwargs: None)
    monkeypatch.setattr(app.state.runtime.guards, "assert_inbound", no_guard)
    monkeypatch.setattr(app.state.runtime.guards, "assert_outbound", no_guard)

    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"model": "groq/openai/gpt-oss-20b", "messages": [{"role": "user", "content": "hello"}]},
    )
    assert response.status_code == 200
    totals = app.state.runtime.billing.status().line_item_totals
    assert totals["inference_model_call"] == pytest.approx(0.4)
    assert totals["security_injection_scan"] == pytest.approx(0.02)
    assert totals["security_content_scan"] == pytest.approx(0.03)
    assert totals["memory_retrieve_attach"] == pytest.approx(0.04)
    assert totals["memory_record_extract"] == pytest.approx(0.05)
    assert totals["pii_redaction"] == pytest.approx(0.08)
    event = app.state.runtime.billing_audit.list_usage_events(limit=1)[0]
    kinds = {item["kind"] for item in event["items"]}
    assert "inference_model_call" in kinds
    assert "security_injection_scan" in kinds
    assert "pii_redaction" in kinds


def test_arc_wallet_address_vector_and_secret_file(tmp_path):
    assert keccak256(b"").hex() == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    assert address_from_private_key((1).to_bytes(32, "big")) == "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"
    keccak256(b"a" * 135)
    path = tmp_path / "arc-wallet.json"
    first = load_or_create_wallet(path, chain_id=5042002)
    second = load_or_create_wallet(path, chain_id=5042002)
    assert first.address == second.address
    assert first.address.startswith("0x")
    assert "private_key" not in repr(first)
    assert path.stat().st_mode & 0o777 == 0o600
    with pytest.raises(ValueError, match="chain id"):
        load_or_create_wallet(path, chain_id=1)


def test_wallet_rpc_failure_returns_503(monkeypatch, make_app):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    monkeypatch.setenv("BILLING_MODE", "wallet")
    app = make_app()

    def boom(_address):
        raise BillingUnavailableError("Arc USDC balance is unavailable.")

    app.state.runtime.billing._chain_reader.balance_usdc = boom
    client = TestClient(app)
    headers = {"Authorization": "Bearer secret-gateway"}
    status = client.get("/billing/status", headers=headers)
    assert status.status_code == 503
    reconcile = client.post("/billing/reconcile", headers=headers)
    assert reconcile.status_code == 503


def test_arc_usdc_http_and_bad_payloads(monkeypatch):
    import app.infrastructure.arc_usdc as arc_usdc

    address = "0x" + "11" * 20

    class _Body:
        def __init__(self, payload: bytes):
            self.payload = payload

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return self.payload

    seen = {}

    def capture(request, timeout=None):
        seen["agent"] = request.get_header("User-agent")
        return _Body(b'{"result":"0x0"}')

    monkeypatch.setattr(arc_usdc.urllib.request, "urlopen", capture)
    assert ArcUsdcReader().balance_usdc(address) == pytest.approx(0.0)
    assert seen["agent"] == "ReaLMM/0.1"

    def down(*_a, **_k):
        raise arc_usdc.urllib.error.URLError("down")

    monkeypatch.setattr(arc_usdc.urllib.request, "urlopen", down)
    with pytest.raises(BillingUnavailableError):
        ArcUsdcReader().balance_usdc(address)

    monkeypatch.setattr(arc_usdc.urllib.request, "urlopen", lambda *_a, **_k: _Body(b"not-json"))
    with pytest.raises(BillingUnavailableError):
        ArcUsdcReader().balance_usdc(address)

    monkeypatch.setattr(arc_usdc.urllib.request, "urlopen", lambda *_a, **_k: _Body(b"[]"))
    with pytest.raises(BillingUnavailableError):
        ArcUsdcReader().balance_usdc(address)

    reader = ArcUsdcReader(transport=lambda _payload: {"result": "0x"})
    assert reader.balance_usdc(address) == pytest.approx(0.0)
    with pytest.raises(BillingUnavailableError):
        ArcUsdcReader(transport=lambda _payload: {"result": "0xzz"}).balance_usdc(address)
    with pytest.raises(BillingUnavailableError):
        ArcUsdcReader(transport=lambda _payload: []).balance_usdc(address)

    def raise_unavailable(_payload):
        raise BillingUnavailableError("Arc USDC balance is unavailable.")

    with pytest.raises(BillingUnavailableError):
        ArcUsdcReader(transport=raise_unavailable).balance_usdc(address)


def test_arc_wallet_rejects_bad_files(tmp_path):
    with pytest.raises(ValueError, match="32 bytes"):
        address_from_private_key(b"\x00" * 31)
    with pytest.raises(ValueError, match="secp256k1"):
        address_from_private_key(b"\x00" * 32)
    from app.infrastructure.arc_wallet import wallet_file_path

    assert wallet_file_path("/tmp/arc-wallet.json", tmp_path) == Path("/tmp/arc-wallet.json")
    assert wallet_file_path("", tmp_path).name == "arc-wallet.json"

    broken = tmp_path / "broken.json"
    broken.write_text("{", encoding="utf-8")
    with pytest.raises(ValueError, match="unreadable"):
        load_or_create_wallet(broken, chain_id=5042002)
    broken.write_text("[]", encoding="utf-8")
    with pytest.raises(ValueError, match="unreadable"):
        load_or_create_wallet(broken, chain_id=5042002)
    broken.write_text(
        json.dumps({"address": "0xabc", "chain_id": 5042002, "private_key": "zz"}),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="unreadable"):
        load_or_create_wallet(broken, chain_id=5042002)
    broken.write_text(
        json.dumps(
            {
                "address": "0x" + "ab" * 20,
                "chain_id": 5042002,
                "private_key": (1).to_bytes(32, "big").hex(),
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="does not match"):
        load_or_create_wallet(broken, chain_id=5042002)


def test_arc_usdc_reader_decodes_balance_of():
    seen = {}

    def transport(payload):
        seen["payload"] = payload
        return {"jsonrpc": "2.0", "id": 1, "result": hex(1_500_000)}

    reader = ArcUsdcReader(transport=transport)
    assert reader.balance_usdc("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf") == pytest.approx(1.5)
    data = seen["payload"]["params"][0]["data"]
    assert data.startswith("0x70a08231")
    assert data.endswith("7e5f4552091a69125d5dfcb7b8c2659029395bdf")

    def failed(_payload):
        return {"error": {"message": "no"}}

    with pytest.raises(BillingUnavailableError):
        ArcUsdcReader(transport=failed).balance_usdc("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf")
    with pytest.raises(BillingUnavailableError):
        ArcUsdcReader(transport=transport).balance_usdc("not-an-address")


def test_arc_reconcile_deposit_and_settle_do_not_restore_spend(monkeypatch, tmp_path):
    chain = {"usdc": 10.0}

    def transport(_payload):
        return {"result": hex(int(chain["usdc"] * 1_000_000))}

    settings = _settings(
        monkeypatch, BILLING_MODE="wallet", BILLING_PREPAID_REQUIRED="1", BILLING_FUNDED_TEAM_ID="operator"
    )
    reader = ArcUsdcReader(transport=transport)
    address = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"
    store = BillingStore(
        settings, state_path=tmp_path / "billing-state.json", chain_reader=reader, wallet_address=address
    )
    gateway = BillingGateway(mode="arc", store=store)

    first = gateway.reconcile()
    assert first.ok is True
    assert first.mode == "arc"
    assert "10.000000" in first.detail
    status = store.status()
    assert status.prepaid_balance_usdc == pytest.approx(10.0)
    assert status.wallet_address == address
    assert status.chain_id == 5042002
    assert status.faucet_url == FAUCET_URL

    chain["usdc"] = 15.0
    gateway.reconcile()
    assert store.status().prepaid_balance_usdc == pytest.approx(15.0)

    subject = store.subject_for("id-operator", IdentityQuotas())
    assert subject.team_id == "operator"
    store.settle(
        hold_id=None,
        actual_usd=4.0,
        idempotency_key="arc-settle",
        items=[BillingLineItem(kind="inference_model_call", usd=4.0)],
        subject=subject,
    )
    third = gateway.reconcile()
    assert third.ok is True
    assert store.status().prepaid_balance_usdc == pytest.approx(11.0)

    other = store.subject_for("id-other", IdentityQuotas(team_id="team-other"))
    store.patch_team_policy(team_id="team-other", prepaid_balance_usdc=1.0)
    store.settle(
        hold_id=None,
        actual_usd=0.4,
        idempotency_key="other-settle",
        items=[BillingLineItem(kind="inference_model_call", usd=0.4)],
        subject=other,
    )
    other_status = store.status(identity_id="id-other", quotas=IdentityQuotas(team_id="team-other"))
    assert other_status.prepaid_balance_usdc == pytest.approx(0.6)
    assert store.status().prepaid_balance_usdc == pytest.approx(11.0)


def test_arc_rpc_failure_does_not_grant_credit(monkeypatch, tmp_path):
    settings = _settings(monkeypatch, BILLING_MODE="wallet")

    def transport(_payload):
        raise OSError("rpc down")

    store = BillingStore(
        settings,
        state_path=tmp_path / "billing-state.json",
        chain_reader=ArcUsdcReader(transport=transport),
        wallet_address="0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
    )
    store.patch_team_policy(team_id="operator", prepaid_balance_usdc=0.0)
    subject = store.subject_for("id-operator", None)
    with pytest.raises(BillingUnavailableError):
        store.assert_can_spend(subject, 1.0, quotas=IdentityQuotas())
    with pytest.raises(BillingUnavailableError):
        BillingGateway(mode="arc", store=store).reconcile()
    raw = json.loads((tmp_path / "billing-state.json").read_text(encoding="utf-8"))
    assert raw["teams"]["operator"]["balance_usdc"] == pytest.approx(0.0)

    class _Boom:
        def balance_usdc(self, _address):
            raise RuntimeError("bad reader")

    wrapped = BillingStore(
        settings,
        state_path=tmp_path / "wrapped.json",
        chain_reader=_Boom(),
        wallet_address="0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
    )
    with pytest.raises(BillingUnavailableError):
        wrapped.refresh_chain_balance()
    bare = BillingStore(settings, state_path=tmp_path / "bare.json")
    with pytest.raises(BillingUnavailableError):
        bare.refresh_chain_balance()


def test_arc_rollover_keeps_lifetime_settled(monkeypatch, tmp_path):
    settings = _settings(monkeypatch, BILLING_MODE="wallet")
    holder = {"value": 15.0}

    def transport(_payload):
        return {"result": hex(int(holder["value"] * 1_000_000))}

    path = tmp_path / "billing-state.json"
    reader = ArcUsdcReader(transport=transport)
    address = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"
    store = BillingStore(settings, state_path=path, chain_reader=reader, wallet_address=address)
    store.refresh_chain_balance()
    subject = store.subject_for("id-operator", None)
    store.settle(
        hold_id=None,
        actual_usd=4.0,
        idempotency_key="arc-life",
        items=[BillingLineItem(kind="inference_model_call", usd=4.0)],
        subject=subject,
    )
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["day"] = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    raw["teams"]["operator"]["spent_usd"] = 9.0
    path.write_text(json.dumps(raw), encoding="utf-8")
    reloaded = BillingStore(settings, state_path=path, chain_reader=reader, wallet_address=address)
    status = reloaded.status()
    assert status.team_daily_spent_usd == pytest.approx(0.0)
    assert status.prepaid_balance_usdc == pytest.approx(11.0)


def test_runtime_wallet_mode_exposes_faucet(monkeypatch, tmp_path):
    monkeypatch.setenv("BILLING_MODE", "wallet")
    monkeypatch.setenv("GATEWAY_ALLOW_OPEN", "1")
    runtime = build_runtime(GatewaySettings(), data_dir=tmp_path, prompts_dir=PROMPTS_DIR)
    wallet_path = tmp_path / "arc-wallet.json"
    assert wallet_path.is_file()
    assert wallet_path.stat().st_mode & 0o777 == 0o600
    runtime.billing._chain_reader = ArcUsdcReader(transport=lambda _payload: {"result": hex(20_000_000)})
    status = runtime.billing.status()
    assert status.mode == "wallet"
    assert status.ledger == "arc"
    assert status.team_id == "operator"
    assert status.prepaid_balance_usdc == pytest.approx(20.0)
    assert status.wallet_address
    assert status.faucet_url == FAUCET_URL
    assert status.chain_id == 5042002
    reconciled = runtime.billing_gateway.reconcile()
    assert reconciled.ok is True
    assert reconciled.mode == "arc"
