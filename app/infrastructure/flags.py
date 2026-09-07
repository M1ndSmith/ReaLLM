from __future__ import annotations

import json
import logging
import threading
from pathlib import Path

from app.application.models import RuntimeFlags
from app.settings import GatewaySettings, parse_on, parse_tri

logger = logging.getLogger(__name__)

FLAG_NAMES = ("MEMORY", "PII", "GUARD", "GUARD_INJECTION", "GUARD_CONTENT")
LAYER_TO_ENV = {
    "memory": "MEMORY",
    "pii": "PII",
    "guard": "GUARD",
    "guard_injection": "GUARD_INJECTION",
    "guard_content": "GUARD_CONTENT",
}
RESTART_FOR = ["keys", "redis", "budgets", "MEMORY_EMBEDDER", "PII_ENTITIES"]


class RuntimeFlagStore:
    """Overlays the five layer flags from data/runtime-flags.json. Does not mutate os.environ."""

    def __init__(self, settings: GatewaySettings, path: Path):
        self._path = path
        self._lock = threading.Lock()
        self._defaults = {
            "MEMORY": settings.memory_on(),
            "PII": settings.pii_on(),
            "GUARD": settings.guard_on(),
            "GUARD_INJECTION": settings.guard_injection_on(),
            "GUARD_CONTENT": settings.guard_content_on(),
        }
        self._overlay: dict[str, bool] = {}
        self.load()

    def path(self) -> Path:
        return self._path

    def load(self) -> None:
        parsed = self._read_file()
        with self._lock:
            self._overlay = parsed

    def _read_file(self) -> dict[str, bool]:
        if not self._path.is_file():
            return {}
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Could not read runtime flags at %s: %s", self._path, exc)
            return {}
        if not isinstance(raw, dict):
            return {}
        parsed: dict[str, bool] = {}
        for name in FLAG_NAMES:
            if name not in raw:
                continue
            value = raw[name]
            if isinstance(value, bool):
                parsed[name] = value
            elif isinstance(value, str):
                parsed[name] = parse_on(value)
        return parsed

    def snapshot(self) -> RuntimeFlags:
        with self._lock:
            memory = self._overlay.get("MEMORY", self._defaults["MEMORY"])
            pii = self._overlay.get("PII", self._defaults["PII"])
            guard = self._overlay.get("GUARD", self._defaults["GUARD"])
            injection = self._overlay.get("GUARD_INJECTION", self._defaults["GUARD_INJECTION"])
            content = self._overlay.get("GUARD_CONTENT", self._defaults["GUARD_CONTENT"])
        return RuntimeFlags(
            memory=memory,
            pii=pii,
            guard=guard,
            guard_injection=injection,
            guard_content=content,
        )

    def save_flags(self, flags: dict[str, bool]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            current = dict(self._overlay)
            current.update(flags)
            payload = {name: current[name] for name in FLAG_NAMES if name in current}
            tmp = self._path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
            tmp.replace(self._path)
            self._overlay = payload

    def apply_layer_patch(self, layers: dict[str, bool | None]) -> RuntimeFlags:
        updates: dict[str, bool] = {}
        for field, env_name in LAYER_TO_ENV.items():
            value = layers.get(field)
            if value is None:
                continue
            updates[env_name] = bool(value)
        if updates:
            self.save_flags(updates)
        return self.snapshot()

    def config_payload(self, *, auth_required: bool) -> dict:
        flags = self.snapshot()
        return {
            "auth_required": auth_required,
            "layers": {
                "memory": flags.memory,
                "pii": flags.pii,
                "guard": flags.guard,
                "guard_injection": flags.guard_injection,
                "guard_content": flags.guard_content,
            },
            "restart_for": list(RESTART_FOR),
        }


def default_flags_from_values(
    *,
    memory: str | bool,
    pii: str | bool,
    guard: str | bool,
    guard_injection: str | bool | None,
    guard_content: str | bool | None,
) -> RuntimeFlags:
    return RuntimeFlags(
        memory=parse_on(memory),
        pii=parse_on(pii),
        guard=parse_on(guard),
        guard_injection=parse_tri(guard_injection, True),
        guard_content=parse_tri(guard_content, True),
    )
