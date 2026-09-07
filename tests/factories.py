from __future__ import annotations

from pathlib import Path

from app.api.app import create_app
from app.application.models import RuntimeFlags
from app.bootstrap import build_runtime
from app.settings import GatewaySettings

ROOT = Path(__file__).resolve().parent.parent
PROMPTS_DIR = ROOT / "prompts"


def settings() -> GatewaySettings:
    return GatewaySettings()


def runtime(tmp_path, *, data_dir=None, prompts_dir=None):
    return build_runtime(
        GatewaySettings(),
        data_dir=data_dir or tmp_path,
        prompts_dir=prompts_dir or PROMPTS_DIR,
    )


def app_for(tmp_path):
    return create_app(runtime(tmp_path))


def flags(**overrides) -> RuntimeFlags:
    values = {
        "memory": False,
        "pii": False,
        "guard": False,
        "guard_injection": True,
        "guard_content": True,
    }
    values.update(overrides)
    return RuntimeFlags(**values)
