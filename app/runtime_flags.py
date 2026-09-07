from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from app.auth import auth_required

logger = logging.getLogger(__name__)

_ON = {"1", "true", "yes", "on"}
_OFF = {"0", "false", "no", "off", "none"}
FLAG_NAMES = ("MEMORY", "PII", "GUARD", "GUARD_INJECTION", "GUARD_CONTENT")
LAYER_TO_ENV = {
    "memory": "MEMORY",
    "pii": "PII",
    "guard": "GUARD",
    "guard_injection": "GUARD_INJECTION",
    "guard_content": "GUARD_CONTENT",
}
RESTART_FOR = ["keys", "redis", "budgets", "MEMORY_EMBEDDER", "PII_ENTITIES"]

_ROOT = Path(__file__).resolve().parent.parent
_FLAGS_PATH = _ROOT / "data" / "runtime-flags.json"


def flags_path() -> Path:
    return _FLAGS_PATH


def _flag_on(name: str) -> bool:
    return (os.getenv(name) or "").strip().lower() in _ON


def _tri_flag(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    if raw in _OFF:
        return False
    if raw in _ON:
        return True
    return default


def layer_state() -> dict[str, bool]:
    return {
        "memory": _flag_on("MEMORY"),
        "pii": _flag_on("PII"),
        "guard": _flag_on("GUARD"),
        "guard_injection": _tri_flag("GUARD_INJECTION", True),
        "guard_content": _tri_flag("GUARD_CONTENT", True),
    }


def load_flags() -> dict[str, bool]:
    path = flags_path()
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Could not read runtime flags at %s: %s", path, exc)
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
            parsed[name] = value.strip().lower() in _ON
    return parsed


def apply_runtime_flags() -> None:
    for name, enabled in load_flags().items():
        os.environ[name] = "1" if enabled else "0"


def save_flags(flags: dict[str, bool]) -> None:
    path = flags_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    current = load_flags()
    current.update(flags)
    payload = {name: current[name] for name in FLAG_NAMES if name in current}
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n")
    tmp.replace(path)


def apply_layer_patch(layers: dict[str, bool | None]) -> dict[str, bool]:
    updates: dict[str, bool] = {}
    for field, env_name in LAYER_TO_ENV.items():
        value = layers.get(field)
        if value is None:
            continue
        updates[env_name] = bool(value)
        os.environ[env_name] = "1" if value else "0"
    if updates:
        save_flags(updates)
    return layer_state()


def config_payload() -> dict:
    return {
        "auth_required": auth_required(),
        "layers": layer_state(),
        "restart_for": list(RESTART_FOR),
    }
