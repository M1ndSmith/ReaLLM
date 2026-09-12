from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_license_and_security_policy_exist():
    license_text = (ROOT / "LICENSE").read_text(encoding="utf-8")
    security = (ROOT / "SECURITY.md").read_text(encoding="utf-8")
    assert "MIT License" in license_text
    assert "Reporting a vulnerability" in security
    assert "GATEWAY_ALLOW_OPEN" in security
    assert "GATEWAY_KEY_PEPPER" in security
    assert "/healthz" in security


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


def test_published_compose_path_is_loopback_and_auth_closed():
    compose = (ROOT / "compose.yaml").read_text(encoding="utf-8")
    assert "127.0.0.1:8000:8000" in compose
    assert "127.0.0.1:3000:3000" in compose
    assert 'GATEWAY_ALLOW_OPEN: "0"' in compose
    assert "GATEWAY_KEY_PEPPER" in compose


def test_dockerfiles_run_non_root_with_healthchecks():
    gateway = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    web = (ROOT / "web" / "Dockerfile").read_text(encoding="utf-8")
    assert "USER realmm" in gateway
    assert "HEALTHCHECK" in gateway
    assert "/healthz" in gateway
    assert "USER realmm" in web
    assert "HEALTHCHECK" in web
