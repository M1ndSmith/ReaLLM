from __future__ import annotations

import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_license_and_security_policy_exist():
    assert (ROOT / "LICENSE").is_file()
    assert (ROOT / "SECURITY.md").is_file()


def test_public_guides_and_env_presets_are_publishable():
    ignore_lines = {
        line.strip()
        for line in (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    }
    assert ".env" in ignore_lines
    assert "data/" in ignore_lines
    assert "web/.env.local" in ignore_lines
    assert "USAGE_WALKTHROUGH.md" not in ignore_lines
    assert "env/" not in ignore_lines
    assert (ROOT / "USAGE_WALKTHROUGH.md").is_file()
    assert (ROOT / "web" / "app" / "healthz" / "route.ts").is_file()
    for name in ("groq.env", "ollama.env", "memory.env", "full.env"):
        preset = (ROOT / "env" / name).read_text(encoding="utf-8")
        assert "GATEWAY_ALLOW_OPEN=1" in preset
        assert "GATEWAY_KEY_PEPPER" in preset
        assert "REALMM_CONFIG=" in preset
        assert "sk-" not in preset
        assert "gsk_" not in preset
        assert "MEMORY=" not in preset
        assert "GUARD=" not in preset
    groq = (ROOT / "env" / "groq.env").read_text(encoding="utf-8")
    ollama = (ROOT / "env" / "ollama.env").read_text(encoding="utf-8")
    memory_env = (ROOT / "env" / "memory.env").read_text(encoding="utf-8")
    full_env = (ROOT / "env" / "full.env").read_text(encoding="utf-8")
    assert "REALMM_CONFIG=config/groq.yaml" in groq
    assert "OLLAMA_API_KEY=ollama" in ollama and "REALMM_CONFIG=config/ollama.yaml" in ollama
    assert "REALMM_CONFIG=config/memory.yaml" in memory_env
    assert "REALMM_CONFIG=config/full.yaml" in full_env
    groq_policy = (ROOT / "config" / "groq.yaml").read_text(encoding="utf-8")
    ollama_policy = (ROOT / "config" / "ollama.yaml").read_text(encoding="utf-8")
    memory_policy = (ROOT / "config" / "memory.yaml").read_text(encoding="utf-8")
    full_policy = (ROOT / "config" / "full.yaml").read_text(encoding="utf-8")
    assert "enabled: false" in groq_policy
    assert "enabled: false" in ollama_policy
    assert "enabled: true" in memory_policy
    assert "llm_model: groq/llama-3.1-8b-instant" in memory_policy
    assert "embedder: fastembed" in memory_policy
    assert "enabled: false" in memory_policy
    assert "enabled: true" in full_policy
    assert "injection_model: groq/meta-llama/llama-prompt-guard-2-22m" in full_policy
    assert "content_model: groq/meta-llama/llama-guard-4-12b" in full_policy


def test_runtime_requirements_are_capped():
    for name in ("requirements.txt", "requirements-pii.txt"):
        lines = [
            line.strip()
            for line in (ROOT / name).read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#") and not line.startswith("-r ")
        ]
        assert lines, name
        for line in lines:
            assert "<" in line, f"unbounded pin in {name}: {line}"
    assert "spacy" in (ROOT / "requirements-pii.txt").read_text(encoding="utf-8")


def test_project_metadata_matches_requirements():
    data = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    project = data["project"]
    assert project["name"] == "realmm"
    assert project["readme"] == "README.md"
    assert project["license"] == "MIT"
    assert project["requires-python"] == ">=3.12,<3.15"
    assert project["urls"]["Repository"] == "https://github.com/M1ndSmith/ReaLLM"
    assert project["urls"]["Issues"] == "https://github.com/M1ndSmith/ReaLLM/issues"
    deps = project["dependencies"]
    pins = [
        line.strip()
        for line in (ROOT / "requirements.txt").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#") and not line.startswith("-r ")
    ]
    for pin in pins:
        assert pin in deps, pin
    assert project["optional-dependencies"]["pii"] == ["spacy>=3.7.0,<4"]


def test_published_compose_path_is_loopback_and_auth_closed():
    compose = (ROOT / "compose.yaml").read_text(encoding="utf-8")
    assert "127.0.0.1:8000:8000" in compose
    assert "127.0.0.1:3000:3000" in compose
    assert 'GATEWAY_ALLOW_OPEN: "0"' in compose
    assert "GATEWAY_KEY_PEPPER" in compose


def test_dockerfiles_run_non_root_with_healthchecks():
    gateway = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    web = (ROOT / "web" / "Dockerfile").read_text(encoding="utf-8")
    assert "python:3.12-slim" in gateway
    assert "USER realmm" in gateway
    assert "HEALTHCHECK" in gateway
    assert "/healthz" in gateway
    assert "USER realmm" in web
    assert "HEALTHCHECK" in web
    assert "/healthz" in web
