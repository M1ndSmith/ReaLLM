from __future__ import annotations

import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_license_and_security_policy_exist():
    license_text = (ROOT / "LICENSE").read_text(encoding="utf-8")
    security = (ROOT / "SECURITY.md").read_text(encoding="utf-8")
    assert "MIT License" in license_text
    assert "Reporting a vulnerability" in security
    assert "fixes land on `Master`" in security
    assert "GATEWAY_ALLOW_OPEN" in security
    assert "GATEWAY_KEY_PEPPER" in security
    assert "/healthz" in security


def test_public_guides_and_env_presets_are_publishable():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
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
    assert "## Prerequisites" in readme
    assert "FastEmbed" in readme
    assert "groq/meta-llama/llama-prompt-guard-2-22m" in readme
    assert "groq/meta-llama/llama-guard-4-12b" in readme
    assert "[Usage walkthrough](USAGE_WALKTHROUGH.md)" in readme
    assert "[`env/`](env/)" in readme
    assert "GATEWAY_KEY_PEPPER" in readme
    assert (ROOT / "USAGE_WALKTHROUGH.md").is_file()
    assert (ROOT / "web" / "app" / "healthz" / "route.ts").is_file()
    walkthrough = (ROOT / "USAGE_WALKTHROUGH.md").read_text(encoding="utf-8")
    assert "CODEBASE_MAP.md" not in walkthrough
    assert "BACKEND_MONTE_CARLO_WALKTHROUGH.md" not in walkthrough
    assert "FastEmbed" in walkthrough
    assert "groq/meta-llama/llama-prompt-guard-2-22m" in walkthrough
    assert "groq/meta-llama/llama-guard-4-12b" in walkthrough
    assert "env/groq.env" in walkthrough
    for name in ("groq.env", "ollama.env", "memory.env", "full.env"):
        preset = (ROOT / "env" / name).read_text(encoding="utf-8")
        assert "GATEWAY_ALLOW_OPEN=1" in preset
        assert "GATEWAY_KEY_PEPPER" in preset
        assert "sk-" not in preset
        assert "gsk_" not in preset
    groq = (ROOT / "env" / "groq.env").read_text(encoding="utf-8")
    ollama = (ROOT / "env" / "ollama.env").read_text(encoding="utf-8")
    memory = (ROOT / "env" / "memory.env").read_text(encoding="utf-8")
    full = (ROOT / "env" / "full.env").read_text(encoding="utf-8")
    assert "MEMORY=0" in groq and "GUARD=0" in groq
    assert "OLLAMA_API_KEY=ollama" in ollama and "MEMORY=0" in ollama
    assert "MEMORY=1" in memory and "MEMORY_LLM_MODEL=" in memory and "MEMORY_EMBEDDER=fastembed" in memory
    assert "GUARD=0" in memory
    assert "MEMORY=1" in full and "GUARD=1" in full
    assert "GUARD_INJECTION_MODEL=" in full and "GUARD_CONTENT_MODEL=" in full


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
