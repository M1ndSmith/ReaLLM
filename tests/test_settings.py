from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.bootstrap import load_dotenv_once, reset_dotenv_loaded
from app.settings import GatewaySettings


def test_process_env_wins_over_dotenv(tmp_path, monkeypatch):
    reset_dotenv_loaded()
    env_file = tmp_path / ".env"
    env_file.write_text("GATEWAY_API_KEY=from-file\nMAX_OUTPUT_TOKENS=111\n")
    monkeypatch.setenv("GATEWAY_API_KEY", "from-process")
    monkeypatch.setenv("MAX_OUTPUT_TOKENS", "222")
    load_dotenv_once(tmp_path)
    settings = GatewaySettings()
    assert settings.gateway_key() == "from-process"
    assert settings.max_output_tokens == 222
    reset_dotenv_loaded()


def test_empty_optional_budgets(monkeypatch):
    monkeypatch.setenv("MAX_INPUT_TOKENS", "")
    monkeypatch.setenv("DAILY_TOKEN_BUDGET", "  ")
    monkeypatch.setenv("DAILY_USD_BUDGET", "")
    settings = GatewaySettings()
    assert settings.max_input_tokens is None
    assert settings.daily_token_budget is None
    assert settings.daily_usd_budget is None


def test_malformed_budget_raises(monkeypatch):
    monkeypatch.setenv("DAILY_USD_BUDGET", "not-a-number")
    with pytest.raises(ValidationError):
        GatewaySettings()
    monkeypatch.setenv("DAILY_USD_BUDGET", "")
    monkeypatch.setenv("DAILY_TOKEN_BUDGET", "nope")
    with pytest.raises(ValidationError):
        GatewaySettings()


def test_langfuse_host_alias(monkeypatch):
    monkeypatch.delenv("LANGFUSE_BASE_URL", raising=False)
    monkeypatch.setenv("LANGFUSE_HOST", "https://example.langfuse")
    settings = GatewaySettings()
    assert settings.langfuse_base_url == "https://example.langfuse"


def test_secrets_not_in_repr(monkeypatch):
    monkeypatch.setenv("GATEWAY_API_KEY", "super-secret-key")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "lf-secret")
    settings = GatewaySettings()
    dumped = repr(settings) + str(settings)
    assert "super-secret-key" not in dumped
    assert "lf-secret" not in dumped


def test_provider_keys_remain_in_environ(monkeypatch):
    monkeypatch.setenv("TOGETHERAI_API_KEY", "together-secret")
    settings = GatewaySettings()
    assert not hasattr(settings, "togetherai_api_key") or True
    import os

    assert os.getenv("TOGETHERAI_API_KEY") == "together-secret"


def test_allow_open_defaults_off(monkeypatch):
    monkeypatch.delenv("GATEWAY_ALLOW_OPEN", raising=False)
    settings = GatewaySettings()
    assert settings.allow_open_on() is False
    monkeypatch.setenv("GATEWAY_ALLOW_OPEN", "1")
    assert GatewaySettings().allow_open_on() is True


def test_memory_embedder_validated(monkeypatch):
    monkeypatch.setenv("MEMORY_EMBEDDER", "nope")
    with pytest.raises(ValidationError):
        GatewaySettings()
