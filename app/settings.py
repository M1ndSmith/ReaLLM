from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic_settings.sources import InitSettingsSource, PydanticBaseSettingsSource

_DEFAULT_CORS = "http://localhost:3000,http://127.0.0.1:3000"
_DEFAULT_INJECTION_MODEL = "groq/meta-llama/llama-prompt-guard-2-22m"
_DEFAULT_CONTENT_MODEL = "groq/meta-llama/llama-guard-4-12b"
_OFF = {"0", "false", "no", "off", "none"}
_ON = {"1", "true", "yes", "on"}
_DEFAULT_PROVIDER_RPM = {
    "groq": 30,
    "openai": 500,
    "anthropic": 50,
    "gemini": 60,
    "xai": 60,
    "mistral": 60,
    "deepseek": 60,
    "openrouter": 60,
}


def _root() -> Path:
    return Path(__file__).resolve().parent.parent


def parse_on(value: str | bool | None) -> bool:
    if isinstance(value, bool):
        return value
    return (value or "").strip().lower() in _ON


def parse_tri(value: str | bool | None, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    raw = (value or "").strip().lower()
    if not raw:
        return default
    if raw in _OFF:
        return False
    if raw in _ON:
        return True
    return default


def _empty_none(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _int_or_default(value: Any, default: int) -> int:
    value = _empty_none(value)
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _optional_int(value: Any) -> int | None:
    value = _empty_none(value)
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("must be an integer") from exc


def _optional_float(value: Any) -> float | None:
    value = _empty_none(value)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("must be a number") from exc


def _policy_path() -> Path:
    raw = (os.getenv("REALMM_CONFIG") or "").strip()
    if not raw:
        return _root() / "config" / "realmm.yaml"
    path = Path(raw)
    if not path.is_absolute():
        path = _root() / path
    return path


def _load_policy() -> dict[str, Any]:
    path = _policy_path()
    if not path.is_file():
        return {}
    import yaml

    loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    if loaded is None:
        return {}
    if not isinstance(loaded, dict):
        raise ValueError(f"{path} must be a mapping")
    return loaded


def _flag(value: Any) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"
    if value is None:
        return ""
    return str(value).strip()


def _csv(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ",".join(str(item).strip() for item in value if str(item).strip())
    return str(value).strip()


def _fallbacks_value(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        joined = ",".join(str(item).strip() for item in value if str(item).strip())
        return joined or None
    text = str(value).strip()
    return text or None


def _env_int(name: str) -> int | None:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return None
    try:
        return int(str(raw).strip())
    except ValueError:
        return None


def _provider_env_rates(suffix: str) -> dict[str, int]:
    found: dict[str, int] = {}
    tail = f"_{suffix}"
    for key, raw in os.environ.items():
        if not key.endswith(tail) or key == f"DEFAULT_{suffix}":
            continue
        if raw is None or not str(raw).strip():
            continue
        try:
            value = int(str(raw).strip())
        except ValueError:
            continue
        provider = key[: -len(tail)].lower()
        if provider:
            found[provider] = value
    return found


def _set_rate(table: dict[str, int], provider: str, value: int) -> None:
    compact = provider.replace("_", "")
    for existing in list(table):
        if existing.replace("_", "") == compact:
            del table[existing]
    table[provider] = value


def _coerce_int(value: Any) -> int | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _provider_rates(policy: dict[str, Any]) -> tuple[dict[str, int], dict[str, int]]:
    rpm = dict(_DEFAULT_PROVIDER_RPM)
    tpm: dict[str, int] = {}
    providers: dict[str, Any] = {}
    rate_limits = policy.get("rate_limits") or {}
    if isinstance(rate_limits, dict) and isinstance(rate_limits.get("providers"), dict):
        providers = rate_limits["providers"]
    for name, spec in providers.items():
        if not isinstance(spec, dict):
            continue
        if spec.get("rpm") is not None:
            parsed = _coerce_int(spec.get("rpm"))
            if parsed is not None:
                _set_rate(rpm, str(name), parsed)
        if spec.get("tpm") is not None:
            parsed = _coerce_int(spec.get("tpm"))
            if parsed is not None:
                _set_rate(tpm, str(name), parsed)
    default_rpm_env = _env_int("DEFAULT_RPM")
    if default_rpm_env is not None:
        for key in list(rpm):
            rpm[key] = default_rpm_env
    if _env_int("DEFAULT_TPM") is not None:
        tpm.clear()
    for name, value in _provider_env_rates("RPM").items():
        _set_rate(rpm, name, value)
    for name, value in _provider_env_rates("TPM").items():
        _set_rate(tpm, name, value)
    return rpm, tpm


def _mapping(policy: dict[str, Any], key: str) -> dict[str, Any]:
    value = policy.get(key) or {}
    return value if isinstance(value, dict) else {}


def flatten_policy(policy: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    rate_limits = _mapping(policy, "rate_limits")
    if rate_limits.get("default_rpm") is not None:
        out["default_rpm"] = rate_limits["default_rpm"]
    if "default_tpm" in rate_limits:
        out["default_tpm"] = rate_limits["default_tpm"]
    provider_rpm, provider_tpm = _provider_rates(policy)
    out["provider_rpm"] = provider_rpm
    out["provider_tpm"] = provider_tpm

    reliability = _mapping(policy, "reliability")
    if reliability.get("retries") is not None:
        out["litellm_num_retries"] = reliability["retries"]
    if reliability.get("cache") is not None:
        out["litellm_cache"] = _flag(reliability["cache"])
    if reliability.get("cache_ttl") is not None:
        out["litellm_cache_ttl"] = reliability["cache_ttl"]
    if "fallbacks" in reliability:
        out["fallbacks"] = _fallbacks_value(reliability["fallbacks"])

    memory = _mapping(policy, "memory")
    if memory.get("enabled") is not None:
        out["memory"] = _flag(memory["enabled"])
    if memory.get("llm_model") is not None:
        out["memory_llm_model"] = str(memory["llm_model"])
    if memory.get("embedder") is not None:
        out["memory_embedder"] = memory["embedder"]

    pii = _mapping(policy, "pii")
    if pii.get("enabled") is not None:
        out["pii"] = _flag(pii["enabled"])
    if pii.get("spacy_model") is not None:
        out["pii_spacy_model"] = str(pii["spacy_model"])
    if pii.get("entities") is not None:
        out["pii_entities"] = _csv(pii["entities"])

    guards = _mapping(policy, "guards")
    if guards.get("enabled") is not None:
        out["guard"] = _flag(guards["enabled"])
    if "injection" in guards:
        out["guard_injection"] = _flag(guards.get("injection"))
    if "content" in guards:
        out["guard_content"] = _flag(guards.get("content"))
    if guards.get("injection_model"):
        out["guard_injection_model"] = str(guards["injection_model"])
    if guards.get("content_model"):
        out["guard_content_model"] = str(guards["content_model"])
    if guards.get("content_ignore") is not None:
        out["guard_content_ignore"] = _csv(guards["content_ignore"])

    budget = _mapping(policy, "budget")
    for src, dest in (
        ("max_output_tokens", "max_output_tokens"),
        ("max_input_tokens", "max_input_tokens"),
        ("daily_token_budget", "daily_token_budget"),
        ("daily_usd_budget", "daily_usd_budget"),
    ):
        if src in budget:
            out[dest] = budget[src]
    return out


def lookup_provider_limit(table: dict[str, int], provider: str) -> int | None:
    if provider in table:
        return table[provider]
    compact = provider.replace("_", "")
    if compact in table:
        return table[compact]
    for key, value in table.items():
        if key.replace("_", "") == compact:
            return value
    return None


class PolicyYamlSource(InitSettingsSource):
    """Nested config/realmm.yaml mapped onto GatewaySettings fields. Below env, above defaults."""

    def __init__(self, settings_cls: type[BaseSettings]):
        super().__init__(settings_cls, flatten_policy(_load_policy()))


class GatewaySettings(BaseSettings):
    """Static ReaLMM knobs. Provider *_API_KEY values stay in os.environ for LiteLLM."""

    model_config = SettingsConfigDict(
        extra="ignore",
        env_file=None,
        populate_by_name=True,
        hide_input_in_errors=True,
    )

    gateway_api_key: SecretStr = SecretStr("")
    gateway_multi_key: str = "1"
    gateway_key_pepper: SecretStr = SecretStr("")
    gateway_allow_open: str = "0"
    gateway_allow_split_budget: str = "0"
    request_id: str = "1"
    structured_logs: str = "0"
    obs_metrics: str = "0"
    readiness_allow_redis_degraded: str = "0"
    cors_origins: str = _DEFAULT_CORS
    console_url: str = "http://localhost:3000"

    litellm_num_retries: int = 2
    litellm_cache: str = "1"
    litellm_cache_ttl: int = 120
    default_rpm: int = 60
    default_tpm: int | None = None
    provider_rpm: dict[str, int] = Field(default_factory=lambda: dict(_DEFAULT_PROVIDER_RPM))
    provider_tpm: dict[str, int] = Field(default_factory=dict)
    fallbacks: str | None = None
    redis_url: str = ""

    langfuse_public_key: SecretStr = SecretStr("")
    langfuse_secret_key: SecretStr = SecretStr("")
    langfuse_base_url: str = Field(
        default="https://cloud.langfuse.com",
        validation_alias=AliasChoices("LANGFUSE_BASE_URL", "LANGFUSE_HOST"),
    )
    langfuse_tracing: str = "1"

    max_output_tokens: int = 2048
    max_input_tokens: int | None = None
    daily_token_budget: int | None = None
    daily_usd_budget: float | None = None

    memory: str = "0"
    memory_llm_model: str = ""
    memory_embedder: str = "fastembed"

    pii: str = "0"
    pii_spacy_model: str = "en_core_web_sm"
    pii_entities: str = ""

    guard: str = "0"
    guard_injection: str = ""
    guard_content: str = ""
    guard_injection_model: str = _DEFAULT_INJECTION_MODEL
    guard_content_model: str = _DEFAULT_CONTENT_MODEL
    guard_content_ignore: str = ""

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            env_settings,
            dotenv_settings,
            PolicyYamlSource(settings_cls),
            file_secret_settings,
        )

    @field_validator("litellm_num_retries", mode="before")
    @classmethod
    def _retries(cls, value: Any) -> int:
        parsed = _int_or_default(value, 2)
        return max(0, parsed)

    @field_validator("litellm_cache_ttl", mode="before")
    @classmethod
    def _cache_ttl(cls, value: Any) -> int:
        return max(1, _int_or_default(value, 120))

    @field_validator("default_rpm", mode="before")
    @classmethod
    def _rpm(cls, value: Any) -> int:
        parsed = _int_or_default(value, 60)
        return parsed if parsed > 0 else 60

    @field_validator("default_tpm", mode="before")
    @classmethod
    def _tpm(cls, value: Any) -> int | None:
        value = _empty_none(value)
        if value is None:
            return None
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None
        return parsed

    @field_validator("max_output_tokens", mode="before")
    @classmethod
    def _max_output(cls, value: Any) -> int:
        parsed = _int_or_default(value, 2048)
        if parsed < 1:
            raise ValueError("MAX_OUTPUT_TOKENS must be >= 1")
        return parsed

    @field_validator("max_input_tokens", "daily_token_budget", mode="before")
    @classmethod
    def _optional_positive_int(cls, value: Any) -> int | None:
        parsed = _optional_int(value)
        if parsed is not None and parsed < 0:
            raise ValueError("must be >= 0")
        return parsed

    @field_validator("daily_usd_budget", mode="before")
    @classmethod
    def _usd(cls, value: Any) -> float | None:
        parsed = _optional_float(value)
        if parsed is not None and parsed < 0:
            raise ValueError("DAILY_USD_BUDGET must be >= 0")
        return parsed

    @field_validator("redis_url", mode="before")
    @classmethod
    def _redis(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @field_validator("fallbacks", mode="before")
    @classmethod
    def _fallbacks(cls, value: Any) -> str | None:
        if value is None:
            return None
        return str(value)

    @field_validator("memory_embedder", mode="before")
    @classmethod
    def _embedder(cls, value: Any) -> str:
        raw = (value or "").strip().lower() or "fastembed"
        if raw not in {"fastembed", "openai"}:
            raise ValueError("MEMORY_EMBEDDER must be fastembed or openai.")
        return raw

    @model_validator(mode="after")
    def _langfuse_base(self) -> GatewaySettings:
        base = (self.langfuse_base_url or "").strip().rstrip("/")
        object.__setattr__(self, "langfuse_base_url", base or "https://cloud.langfuse.com")
        return self

    def gateway_key(self) -> str:
        return self.gateway_api_key.get_secret_value().strip()

    def auth_required(self) -> bool:
        return bool(self.gateway_key())

    def gateway_multi_key_on(self) -> bool:
        return parse_tri(self.gateway_multi_key, True)

    def gateway_key_pepper_value(self) -> str:
        return self.gateway_key_pepper.get_secret_value().strip()

    def allow_open_on(self) -> bool:
        return parse_on(self.gateway_allow_open)

    def allow_split_budget_on(self) -> bool:
        return parse_on(self.gateway_allow_split_budget)

    def request_id_on(self) -> bool:
        return parse_tri(self.request_id, True)

    def structured_logs_on(self) -> bool:
        return parse_on(self.structured_logs)

    def obs_metrics_on(self) -> bool:
        return parse_on(self.obs_metrics)

    def readiness_allow_redis_degraded_on(self) -> bool:
        return parse_on(self.readiness_allow_redis_degraded)

    def cors_origin_list(self) -> list[str]:
        raw = (self.cors_origins or _DEFAULT_CORS).strip()
        return [item.strip() for item in raw.split(",") if item.strip()]

    def console_href(self) -> str:
        return (self.console_url or "http://localhost:3000").strip().rstrip("/")

    def provider_rpm_limit(self, provider: str) -> int:
        found = lookup_provider_limit(self.provider_rpm, provider)
        if found is not None:
            return found
        return self.default_rpm

    def provider_tpm_limit(self, provider: str) -> int | None:
        found = lookup_provider_limit(self.provider_tpm, provider)
        if found is not None:
            return found
        return self.default_tpm

    def cache_enabled(self) -> bool:
        raw = (self.litellm_cache or "1").strip().lower()
        return raw not in _OFF

    def redis_enabled(self) -> bool:
        return bool((self.redis_url or "").strip())

    def redis_url_value(self) -> str | None:
        url = (self.redis_url or "").strip()
        return url or None

    def langfuse_public(self) -> str:
        return self.langfuse_public_key.get_secret_value().strip()

    def langfuse_secret(self) -> str:
        return self.langfuse_secret_key.get_secret_value().strip()

    def prompts_enabled(self) -> bool:
        return bool(self.langfuse_public() and self.langfuse_secret())

    def tracing_on(self) -> bool:
        if not self.prompts_enabled():
            return False
        raw = (self.langfuse_tracing or "1").strip().lower()
        return raw not in _OFF

    def memory_on(self) -> bool:
        return parse_on(self.memory)

    def pii_on(self) -> bool:
        return parse_on(self.pii)

    def guard_on(self) -> bool:
        return parse_on(self.guard)

    def guard_injection_on(self) -> bool:
        return parse_tri(self.guard_injection, True)

    def guard_content_on(self) -> bool:
        return parse_tri(self.guard_content, True)

    def pii_entity_list(self) -> list[str]:
        default = [
            "EMAIL_ADDRESS",
            "PHONE_NUMBER",
            "CREDIT_CARD",
            "US_SSN",
            "IBAN_CODE",
            "IP_ADDRESS",
        ]
        raw = (self.pii_entities or "").strip()
        if not raw:
            return list(default)
        entities = [item.strip() for item in raw.split(",") if item.strip()]
        return entities or list(default)

    def spacy_model(self) -> str:
        return (self.pii_spacy_model or "").strip() or "en_core_web_sm"

    def __repr__(self) -> str:
        return (
            "GatewaySettings("
            f"auth_required={self.auth_required()!r}, "
            f"cache={self.cache_enabled()!r}, "
            f"redis={self.redis_enabled()!r})"
        )

    def __str__(self) -> str:
        return repr(self)
