from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.application.models import GatewayIdentity, IdentityQuotas, IdentityScope
from app.settings import GatewaySettings

logger = logging.getLogger(__name__)

ALL_SCOPES: tuple[IdentityScope, ...] = ("read", "chat", "config", "admin")
_SCOPE_SET = set(ALL_SCOPES)
_DEFAULT_ID = "default"
_LAST_USED_FLUSH_SECONDS = 60.0
_DEV_PEPPER = "realmm-dev-pepper"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _normalize_scopes(value: object) -> tuple[IdentityScope, ...]:
    if not isinstance(value, list):
        return tuple()
    scopes: list[IdentityScope] = []
    seen: set[str] = set()
    for item in value:
        text = str(item).strip().lower()
        if text not in _SCOPE_SET or text in seen:
            continue
        seen.add(text)
        scopes.append(text)  # type: ignore[arg-type]
    return tuple(scopes)


def _normalize_quota_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    if parsed < 0:
        return None
    return parsed


def _normalize_quota_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed < 0:
        return None
    return parsed


class GatewayIdentityStore:
    def __init__(self, settings: GatewaySettings, path: Path):
        self._settings = settings
        self._path = path
        self._lock = threading.RLock()
        self._records: dict[str, dict[str, Any]] = {}
        self._last_used_flush_at: dict[str, float] = {}
        self.load()
        self.ensure_bootstrap_default()

    def path(self) -> Path:
        return self._path

    def auth_enabled(self) -> bool:
        if not self._settings.gateway_multi_key_on():
            return bool(self._settings.gateway_key())
        with self._lock:
            active = any(not record.get("revoked_at") for record in self._records.values())
        return active or bool(self._settings.gateway_key())

    def _pepper(self) -> str:
        pepper = self._settings.gateway_key_pepper_value()
        if pepper:
            return pepper
        if self._settings.allow_open_on():
            return self._settings.gateway_key() or _DEV_PEPPER
        raise RuntimeError(
            "GATEWAY_KEY_PEPPER is required unless GATEWAY_ALLOW_OPEN=1. "
            "Compose and any reachable bind must set a dedicated pepper for issued keys."
        )

    def _hash_secret(self, secret: str) -> str:
        payload = f"{self._pepper()}\0{secret}".encode("utf-8")
        return f"sha256:{hashlib.sha256(payload).hexdigest()}"

    def _verify_hash(self, secret: str, stored: str) -> bool:
        if not stored.startswith("sha256:"):
            return False
        expected = self._hash_secret(secret)
        return hmac.compare_digest(expected, stored)

    def _identity_from_record(self, key_id: str, record: dict[str, Any]) -> GatewayIdentity:
        scopes = _normalize_scopes(record.get("scopes"))
        quotas_raw = record.get("quotas") if isinstance(record.get("quotas"), dict) else {}
        quotas = IdentityQuotas(
            daily_token_budget=_normalize_quota_int(quotas_raw.get("daily_token_budget")),
            daily_usd_budget=_normalize_quota_float(quotas_raw.get("daily_usd_budget")),
            rpm_limit=_normalize_quota_int(quotas_raw.get("rpm")),
        )
        return GatewayIdentity(
            id=key_id,
            scopes=scopes,
            label=record.get("label") if isinstance(record.get("label"), str) else None,
            created_at=record.get("created_at") if isinstance(record.get("created_at"), str) else None,
            revoked_at=record.get("revoked_at") if isinstance(record.get("revoked_at"), str) else None,
            last_used_at=record.get("last_used_at") if isinstance(record.get("last_used_at"), str) else None,
            quotas=quotas,
        )

    def load(self) -> None:
        parsed: dict[str, dict[str, Any]] = {}
        if self._path.is_file():
            try:
                payload = json.loads(self._path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                logger.warning("Could not read gateway keys at %s: %s", self._path, exc)
                payload = {}
            if isinstance(payload, dict):
                keys = payload.get("keys")
                if isinstance(keys, dict):
                    for key_id, raw in keys.items():
                        if isinstance(key_id, str) and isinstance(raw, dict):
                            parsed[key_id] = dict(raw)
        with self._lock:
            self._records = parsed

    def _save_unlocked(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"version": 1, "keys": self._records}
        tmp = self._path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        tmp.replace(self._path)

    def ensure_bootstrap_default(self) -> None:
        if not self._settings.gateway_multi_key_on():
            return
        legacy = self._settings.gateway_key()
        if not legacy:
            return
        with self._lock:
            if self._records:
                return
            now = _utc_now()
            self._records[_DEFAULT_ID] = {
                "secret_hash": self._hash_secret(legacy),
                "scopes": list(ALL_SCOPES),
                "label": "Migrated from GATEWAY_API_KEY",
                "created_at": now,
                "revoked_at": None,
                "last_used_at": None,
                "quotas": {"daily_token_budget": None, "daily_usd_budget": None, "rpm": None},
            }
            self._save_unlocked()

    def list(self, *, include_revoked: bool = False) -> list[GatewayIdentity]:
        with self._lock:
            items = [
                self._identity_from_record(key_id, record)
                for key_id, record in sorted(self._records.items())
                if include_revoked or not record.get("revoked_at")
            ]
        return items

    def public_payload(self, *, include_revoked: bool = False) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for identity in self.list(include_revoked=include_revoked):
            row = {
                "id": identity.id,
                "scopes": list(identity.scopes),
                "label": identity.label,
                "created_at": identity.created_at,
                "revoked_at": identity.revoked_at,
                "last_used_at": identity.last_used_at,
                "quotas": {
                    "daily_token_budget": identity.quotas.daily_token_budget,
                    "daily_usd_budget": identity.quotas.daily_usd_budget,
                    "rpm": identity.quotas.rpm_limit,
                },
            }
            rows.append(row)
        return rows

    def resolve(self, secret: str) -> GatewayIdentity | None:
        candidate = secret.strip()
        if not candidate:
            return None
        if self._settings.gateway_multi_key_on():
            with self._lock:
                for key_id, record in self._records.items():
                    if record.get("revoked_at"):
                        continue
                    secret_hash = record.get("secret_hash")
                    if not isinstance(secret_hash, str):
                        continue
                    if self._verify_hash(candidate, secret_hash):
                        record["last_used_at"] = _utc_now()
                        now = time.monotonic()
                        last_flush = self._last_used_flush_at.get(key_id, 0.0)
                        if now - last_flush >= _LAST_USED_FLUSH_SECONDS:
                            self._last_used_flush_at[key_id] = now
                            self._save_unlocked()
                        return self._identity_from_record(key_id, record)
        legacy = self._settings.gateway_key()
        if legacy and hmac.compare_digest(candidate, legacy):
            return GatewayIdentity(id=_DEFAULT_ID, scopes=ALL_SCOPES, label="GATEWAY_API_KEY")
        return None

    def get(self, key_id: str) -> GatewayIdentity | None:
        with self._lock:
            record = self._records.get(key_id)
            if record is None:
                return None
            return self._identity_from_record(key_id, record)

    def create(
        self,
        *,
        key_id: str,
        scopes: list[str],
        label: str | None = None,
        secret: str | None = None,
        quotas: IdentityQuotas | None = None,
    ) -> tuple[GatewayIdentity, str]:
        clean_id = key_id.strip()
        if not clean_id:
            raise ValueError("key_id is required")
        normalized_scopes = _normalize_scopes(scopes)
        if not normalized_scopes:
            raise ValueError("At least one valid scope is required.")
        issued = secret or secrets.token_urlsafe(32)
        quota_obj = quotas or IdentityQuotas()
        now = _utc_now()
        with self._lock:
            if clean_id in self._records:
                raise ValueError(f"Key '{clean_id}' already exists.")
            self._records[clean_id] = {
                "secret_hash": self._hash_secret(issued),
                "scopes": list(normalized_scopes),
                "label": label.strip() if isinstance(label, str) and label.strip() else None,
                "created_at": now,
                "revoked_at": None,
                "last_used_at": None,
                "quotas": {
                    "daily_token_budget": quota_obj.daily_token_budget,
                    "daily_usd_budget": quota_obj.daily_usd_budget,
                    "rpm": quota_obj.rpm_limit,
                },
            }
            self._save_unlocked()
            identity = self._identity_from_record(clean_id, self._records[clean_id])
        return identity, issued

    def patch(
        self,
        *,
        key_id: str,
        scopes: list[str] | None = None,
        label: str | None = None,
        revoked: bool | None = None,
        quotas: IdentityQuotas | None = None,
    ) -> GatewayIdentity:
        with self._lock:
            record = self._records.get(key_id)
            if record is None:
                raise ValueError(f"Unknown key '{key_id}'.")
            if scopes is not None:
                normalized_scopes = _normalize_scopes(scopes)
                if not normalized_scopes:
                    raise ValueError("At least one valid scope is required.")
                record["scopes"] = list(normalized_scopes)
            if label is not None:
                record["label"] = label.strip() or None
            if revoked is True:
                record["revoked_at"] = _utc_now()
            elif revoked is False:
                record["revoked_at"] = None
            if quotas is not None:
                record["quotas"] = {
                    "daily_token_budget": quotas.daily_token_budget,
                    "daily_usd_budget": quotas.daily_usd_budget,
                    "rpm": quotas.rpm_limit,
                }
            self._save_unlocked()
            return self._identity_from_record(key_id, record)

    def revoke(self, key_id: str) -> GatewayIdentity:
        return self.patch(key_id=key_id, revoked=True)

    def quotas_for(self, identity_id: str | None) -> IdentityQuotas:
        if not identity_id:
            return IdentityQuotas()
        identity = self.get(identity_id)
        if identity is None:
            return IdentityQuotas()
        return identity.quotas
