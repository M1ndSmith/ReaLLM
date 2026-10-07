from __future__ import annotations

import json
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.application.errors import BillingUnavailableError, BudgetExceededError
from app.application.models import BillingLineItem, BillingStatus, BillingSubject, IdentityQuotas
from app.infrastructure.arc_wallet import FAUCET_URL
from app.settings import GatewaySettings


def _utc_day() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _coerce_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class BillingStore:
    """File-backed billing ledger with hold/settle/release and team caps."""

    def __init__(
        self,
        settings: GatewaySettings,
        *,
        state_path: Path,
        chain_reader: Any | None = None,
        wallet_address: str | None = None,
    ):
        self._settings = settings
        self._state_path = state_path
        self._chain_reader = chain_reader
        self.wallet_address = (wallet_address or "").strip() or None
        self._lock = threading.RLock()

    def _empty_state(self) -> dict[str, Any]:
        return {
            "day": _utc_day(),
            "teams": {},
            "holds": {},
            "idempotency": {},
            "line_item_totals": {},
        }

    def _load(self) -> dict[str, Any]:
        if not self._state_path.is_file():
            return self._empty_state()
        try:
            data = json.loads(self._state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return self._empty_state()
        if not isinstance(data, dict):
            return self._empty_state()
        if data.get("day") != _utc_day():
            keep_teams = data.get("teams") if isinstance(data.get("teams"), dict) else {}
            state = self._empty_state()
            # Carry forward balances while resetting daily spend.
            for team_id, payload in keep_teams.items():
                if isinstance(team_id, str) and isinstance(payload, dict):
                    state["teams"][team_id] = {
                        "balance_usdc": max(0.0, _coerce_float(payload.get("balance_usdc"), 0.0)),
                        "spent_usd": 0.0,
                        "lifetime_settled_usdc": max(0.0, _coerce_float(payload.get("lifetime_settled_usdc"), 0.0)),
                    }
            return state
        data.setdefault("teams", {})
        data.setdefault("holds", {})
        data.setdefault("idempotency", {})
        data.setdefault("line_item_totals", {})
        return data

    def _save(self, state: dict[str, Any]) -> None:
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
        tmp.replace(self._state_path)

    def _team_entry(self, state: dict[str, Any], team_id: str) -> dict[str, float]:
        teams = state.setdefault("teams", {})
        row = teams.get(team_id)
        if not isinstance(row, dict):
            row = {"balance_usdc": 0.0, "spent_usd": 0.0}
            teams[team_id] = row
        row["balance_usdc"] = max(0.0, _coerce_float(row.get("balance_usdc")))
        row["spent_usd"] = max(0.0, _coerce_float(row.get("spent_usd")))
        row["lifetime_settled_usdc"] = max(0.0, _coerce_float(row.get("lifetime_settled_usdc")))
        return row

    def subject_for(self, identity_id: str | None, quotas: IdentityQuotas | None = None) -> BillingSubject:
        explicit = quotas.team_id if quotas is not None else None
        if explicit:
            team_id = explicit
        elif self._settings.billing_wallet_mode():
            team_id = self._funded_team_id()
        else:
            team_id = identity_id
        return BillingSubject(identity_id=identity_id, team_id=team_id)

    def _funded_team_id(self) -> str:
        return (self._settings.billing_funded_team_id or "operator").strip() or "operator"

    def _chain_sync_applies(self, team_id: str | None) -> bool:
        return bool(
            team_id
            and team_id == self._funded_team_id()
            and self._settings.billing_wallet_mode()
            and self._chain_reader is not None
            and self.wallet_address
        )

    def refresh_chain_balance(self) -> float:
        if self._chain_reader is None or not self.wallet_address:
            raise BillingUnavailableError("Arc USDC balance is unavailable.")
        try:
            on_chain = self._chain_reader.balance_usdc(self.wallet_address)
        except BillingUnavailableError:
            raise
        except Exception as exc:
            raise BillingUnavailableError("Arc USDC balance is unavailable.") from exc
        on_chain = max(0.0, float(on_chain))
        with self._lock:
            state = self._load()
            team = self._team_entry(state, self._funded_team_id())
            available = round(max(0.0, on_chain - team["lifetime_settled_usdc"]), 8)
            team["balance_usdc"] = available
            self._save(state)
            return available

    def assert_can_spend(
        self,
        subject: BillingSubject,
        estimated_usd: float | None,
        *,
        quotas: IdentityQuotas | None = None,
    ) -> None:
        if not self._settings.billing_enforce_mode():
            return
        if self._chain_sync_applies(subject.team_id):
            self.refresh_chain_balance()
        amount = max(0.0, float(estimated_usd or 0.0))
        if quotas and quotas.max_per_call_usd is not None and amount > quotas.max_per_call_usd:
            raise BudgetExceededError(
                f"Per-call spend cap exceeded. Requested ${amount:.6f}, cap is ${quotas.max_per_call_usd:.6f}."
            )
        if subject.team_id is None:
            return
        with self._lock:
            state = self._load()
            team = self._team_entry(state, subject.team_id)
            cap = quotas.team_daily_usd_cap if quotas is not None else None
            if cap is not None and (team["spent_usd"] + amount) > cap:
                remaining = max(0.0, cap - team["spent_usd"])
                raise BudgetExceededError(
                    f"Team daily USD cap exceeded. ${team['spent_usd']:.6f} used, ${remaining:.6f} left, "
                    f"estimate ${amount:.6f} (cap ${cap:.6f})."
                )
            if self._settings.billing_wallet_mode():
                prepaid_required = True
            else:
                prepaid_required = quotas.prepaid_required if quotas is not None else None
                if prepaid_required is None:
                    prepaid_required = self._settings.billing_prepaid_required_on()
            if prepaid_required and amount > team["balance_usdc"]:
                raise BudgetExceededError(
                    f"Insufficient prepaid balance. Need ${amount:.6f}, available ${team['balance_usdc']:.6f}."
                )

    def hold(
        self,
        *,
        subject: BillingSubject,
        estimated_usd: float | None,
        idempotency_key: str,
    ) -> str | None:
        amount = max(0.0, float(estimated_usd or 0.0))
        if amount <= 0:
            return None
        with self._lock:
            state = self._load()
            known = state.get("idempotency", {}).get(idempotency_key)
            if isinstance(known, dict) and isinstance(known.get("hold_id"), str):
                return known["hold_id"]
            hold_id = secrets.token_hex(10)
            holds = state.setdefault("holds", {})
            holds[hold_id] = {
                "team_id": subject.team_id,
                "identity_id": subject.identity_id,
                "estimated_usd": amount,
            }
            idem = state.setdefault("idempotency", {})
            idem[idempotency_key] = {"hold_id": hold_id, "settled": False}
            self._save(state)
            return hold_id

    def release(self, hold_id: str | None) -> None:
        if not hold_id:
            return
        with self._lock:
            state = self._load()
            holds = state.setdefault("holds", {})
            if hold_id in holds:
                del holds[hold_id]
                self._save(state)

    def settle(
        self,
        *,
        hold_id: str | None,
        actual_usd: float | None,
        idempotency_key: str,
        items: list[BillingLineItem] | None = None,
        subject: BillingSubject | None = None,
    ) -> None:
        total = max(0.0, float(actual_usd or 0.0))
        with self._lock:
            state = self._load()
            idem = state.setdefault("idempotency", {})
            known = idem.get(idempotency_key)
            if isinstance(known, dict) and known.get("settled") is True:
                return

            holds = state.setdefault("holds", {})
            hold = holds.get(hold_id or "")
            team_id = subject.team_id if subject else None
            if team_id is None and isinstance(hold, dict):
                team_id = hold.get("team_id")
            if isinstance(team_id, str) and team_id:
                team = self._team_entry(state, team_id)
                if self._settings.billing_wallet_mode():
                    prepaid_required = True
                else:
                    prepaid_required = self._settings.billing_prepaid_required_on()
                if prepaid_required and not self._settings.billing_shadow_mode() and team["balance_usdc"] < total:
                    raise BudgetExceededError(
                        f"Insufficient prepaid balance at settlement. Need ${total:.6f}, "
                        f"available ${team['balance_usdc']:.6f}."
                    )
                team["spent_usd"] = round(team["spent_usd"] + total, 8)
                if not self._settings.billing_shadow_mode():
                    team["balance_usdc"] = round(max(0.0, team["balance_usdc"] - total), 8)
                    team["lifetime_settled_usdc"] = round(team["lifetime_settled_usdc"] + total, 8)

            totals = state.setdefault("line_item_totals", {})
            for item in items or []:
                prev = _coerce_float(totals.get(item.kind), 0.0)
                totals[item.kind] = round(prev + max(0.0, float(item.usd)), 8)

            if hold_id and hold_id in holds:
                del holds[hold_id]
            if not isinstance(known, dict):
                known = {}
            known["settled"] = True
            known["total_usd"] = round(total, 8)
            known["hold_id"] = hold_id
            idem[idempotency_key] = known
            self._save(state)

    def status(self, identity_id: str | None = None, quotas: IdentityQuotas | None = None) -> BillingStatus:
        subject = self.subject_for(identity_id, quotas)
        if self._chain_sync_applies(subject.team_id):
            self.refresh_chain_balance()
        with self._lock:
            state = self._load()
            team = (
                self._team_entry(state, subject.team_id) if subject.team_id else {"balance_usdc": 0.0, "spent_usd": 0.0}
            )
            totals = state.get("line_item_totals") if isinstance(state.get("line_item_totals"), dict) else {}
            line_item_totals = {
                str(key): round(max(0.0, _coerce_float(value)), 8)
                for key, value in totals.items()
                if isinstance(key, str)
            }
        cap = quotas.team_daily_usd_cap if quotas is not None else None
        wallet_mode = self._settings.billing_wallet_mode()
        return BillingStatus(
            mode=self._settings.billing_mode_value(),  # type: ignore[arg-type]
            prepaid_required=(
                True
                if wallet_mode
                else (
                    quotas.prepaid_required
                    if quotas and quotas.prepaid_required is not None
                    else self._settings.billing_prepaid_required_on()
                )
            ),
            ledger="arc" if self._chain_reader is not None and wallet_mode else "file",
            team_id=subject.team_id,
            prepaid_balance_usdc=team["balance_usdc"],
            team_daily_spent_usd=team["spent_usd"],
            team_daily_cap_usd=cap,
            line_item_totals=line_item_totals,
            wallet_address=self.wallet_address if wallet_mode else None,
            chain_id=self._settings.billing_arc_chain_id if wallet_mode else None,
            faucet_url=FAUCET_URL if wallet_mode else None,
        )

    def patch_team_policy(
        self,
        *,
        team_id: str,
        daily_usd_cap: float | None = None,
        prepaid_balance_usdc: float | None = None,
    ) -> dict[str, float | None]:
        with self._lock:
            state = self._load()
            team = self._team_entry(state, team_id)
            if prepaid_balance_usdc is not None:
                team["balance_usdc"] = max(0.0, float(prepaid_balance_usdc))
            self._save(state)
        return {
            "daily_usd_cap": daily_usd_cap,
            "prepaid_balance_usdc": team["balance_usdc"],
        }
