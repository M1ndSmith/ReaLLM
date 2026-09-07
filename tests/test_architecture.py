from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"


def _imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.append(node.module)
    return names


def _py_files(package: Path) -> list[Path]:
    return [path for path in package.rglob("*.py") if path.name != "__pycache__"]


def test_application_does_not_import_fastapi_or_routes():
    for path in _py_files(APP / "application"):
        for name in _imports(path):
            root = name.split(".")[0]
            assert root not in {"fastapi", "starlette", "litellm", "mem0", "presidio_analyzer", "redis"}
            assert not name.startswith("app.api")
            assert not name.startswith("app.infrastructure")


def test_only_router_runtime_owns_litellm_router():
    offenders = []
    for path in _py_files(APP):
        text = path.read_text(encoding="utf-8")
        if path == APP / "infrastructure" / "router.py":
            assert "Router(" in text or "from litellm import Router" in text
            continue
        if "litellm.Router" in text or "from litellm import Router" in text:
            offenders.append(str(path.relative_to(ROOT)))
        if "litellm.cache =" in text:
            offenders.append(f"{path.relative_to(ROOT)} mutates litellm.cache")
    assert offenders == []


def test_api_routes_do_not_import_providers():
    forbidden = {"litellm", "mem0", "presidio_analyzer", "presidio_anonymizer", "redis"}
    for path in _py_files(APP / "api" / "routes"):
        for name in _imports(path):
            assert name.split(".")[0] not in forbidden


def test_infrastructure_does_not_import_api():
    for path in _py_files(APP / "infrastructure"):
        for name in _imports(path):
            assert not name.startswith("app.api")


def test_bootstrap_is_the_cross_layer_wire():
    text = (APP / "bootstrap.py").read_text(encoding="utf-8")
    assert "from app.application.chat import ChatService" in text
    assert "from app.api.app import create_app" in text
    assert "LiteLLMRouterRuntime" in text


def test_legacy_flat_modules_removed():
    leftover = [
        "llm.py",
        "reliability.py",
        "budget.py",
        "memory.py",
        "pii.py",
        "prompts.py",
        "guardrails.py",
        "auth.py",
        "runtime_flags.py",
        "openai_compat.py",
    ]
    present = [name for name in leftover if (APP / name).is_file()]
    assert present == []
