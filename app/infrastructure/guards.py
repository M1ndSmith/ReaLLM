from __future__ import annotations

import asyncio
import logging

from app.application.errors import GuardBlockedError, GuardConfigError, UnknownModelError
from app.application.models import RuntimeFlags
from app.application.ports import CompletionBackend, ModelCatalogPort, UsageBudgetPort
from app.schemas import ChatMessage, GuardInfo
from app.settings import GatewaySettings

logger = logging.getLogger(__name__)

_INJECTION_WINDOW = 512
_INJECTION_MAX_TOKENS = 16
_CONTENT_MAX_TOKENS = 64
_CONTENT_CATEGORY_NAMES = {
    "S1": "Violent Crimes",
    "S2": "Non-Violent Crimes",
    "S3": "Sex-Related Crimes",
    "S4": "Child Sexual Exploitation",
    "S5": "Defamation",
    "S6": "Specialized Advice",
    "S7": "Privacy",
    "S8": "Intellectual Property",
    "S9": "Indiscriminate Weapons",
    "S10": "Hate",
    "S11": "Suicide & Self-Harm",
    "S12": "Sexual Content",
    "S13": "Elections",
    "S14": "Code Interpreter Abuse",
}


def injection_is_malicious(text: str) -> bool:
    lowered = (text or "").strip().lower()
    if not lowered:
        raise GuardConfigError("Prompt Guard returned empty text.")
    head = lowered.splitlines()[0].strip()
    token = head.split()[0] if head.split() else head
    if token in {"malicious", "1", "label_1", "label1", "unsafe"}:
        return True
    if token in {"benign", "0", "label_0", "label0", "safe"}:
        return False
    if "malicious" in head and "benign" not in head:
        return True
    if head == "benign" or head.startswith("benign"):
        return False
    raise GuardConfigError("Prompt Guard returned an unrecognized verdict.")


def parse_content_verdict(text: str) -> tuple[bool, list[str]]:
    stripped = (text or "").strip()
    if not stripped:
        raise GuardConfigError("Llama Guard returned empty text.")
    lines = [line.strip() for line in stripped.splitlines() if line.strip()]
    head = lines[0].lower()
    if head == "unsafe" or head.startswith("unsafe"):
        categories = [line.upper() for line in lines[1:] if line]
        return True, categories
    if head == "safe":
        return False, []
    raise GuardConfigError("Llama Guard returned an unrecognized verdict.")


def category_names_for(codes: list[str]) -> list[str]:
    return [_CONTENT_CATEGORY_NAMES.get(code, code) for code in codes]


class GuardService:
    def __init__(
        self,
        settings: GatewaySettings,
        catalog: ModelCatalogPort,
        backend: CompletionBackend,
        budget: UsageBudgetPort,
    ):
        self._settings = settings
        self._catalog = catalog
        self._backend = backend
        self._budget = budget

    def content_enabled(self, flags: RuntimeFlags) -> bool:
        return flags.guard and flags.guard_content

    def injection_enabled(self, flags: RuntimeFlags) -> bool:
        return flags.guard and flags.guard_injection

    def requested_injection_model(self) -> str:
        return self._settings.guard_injection_model or "groq/meta-llama/llama-prompt-guard-2-22m"

    def requested_content_model(self) -> str:
        return self._settings.guard_content_model or "groq/meta-llama/llama-guard-4-12b"

    def ignored_content_categories(self, *, strict: bool = True) -> list[str]:
        raw = self._settings.guard_content_ignore
        if not raw:
            return []
        codes: list[str] = []
        for part in raw.split(","):
            code = part.strip().upper()
            if not code:
                continue
            if code not in _CONTENT_CATEGORY_NAMES:
                if strict:
                    raise GuardConfigError(f"GUARD_CONTENT_IGNORE contains unknown category '{code}'. Use S1–S14.")
                continue
            if code not in codes:
                codes.append(code)
        return codes

    def status(self, flags: RuntimeFlags) -> GuardInfo:
        if not flags.guard:
            return GuardInfo(enabled=False)
        content_on = flags.guard_content
        injection_on = flags.guard_injection
        return GuardInfo(
            enabled=True,
            injection=injection_on,
            content=content_on,
            injection_model=self.requested_injection_model() if injection_on else None,
            content_model=self.requested_content_model() if content_on else None,
            content_ignore=self.ignored_content_categories(strict=False) if content_on else [],
        )

    def _ensure_scanners(self, flags: RuntimeFlags) -> None:
        if not flags.guard:
            return
        if not flags.guard_injection and not flags.guard_content:
            raise GuardConfigError("GUARD=1 requires GUARD_INJECTION or GUARD_CONTENT to be on.")
        if flags.guard_content:
            self.ignored_content_categories(strict=True)

    def _resolve_guard_model(self, requested: str, kind: str) -> str:
        try:
            return self._catalog.resolve_model(requested)
        except UnknownModelError as exc:
            raise GuardConfigError(
                f"Guard {kind} model '{requested}' is not in the catalog. "
                "Set GROQ_API_KEY or GUARD_INJECTION_MODEL / GUARD_CONTENT_MODEL to a catalog id."
            ) from exc

    def _chunk_text(self, model: str, text: str, limit: int = _INJECTION_WINDOW) -> list[str]:
        cleaned = text.strip()
        if not cleaned:
            return []
        if self._budget.token_count_text(model, cleaned) <= limit:
            return [cleaned]
        mid = max(1, len(cleaned) // 2)
        split = cleaned.rfind(" ", 0, mid)
        if split < 1:
            split = mid
        return self._chunk_text(model, cleaned[:split], limit) + self._chunk_text(model, cleaned[split:], limit)

    def _inbound_injection_blob(self, messages: list[ChatMessage]) -> str:
        parts = [item.content.strip() for item in messages if item.role in {"user", "system"} and item.content.strip()]
        return "\n\n".join(parts)

    def _inbound_system_blob(self, messages: list[ChatMessage]) -> str:
        parts = [item.content.strip() for item in messages if item.role == "system" and item.content.strip()]
        return "\n\n".join(parts)

    def _memory_write_blob(self, messages: list[ChatMessage]) -> str:
        return "\n\n".join(item.content.strip() for item in messages if item.content.strip())

    def _latest_user_text(self, messages: list[ChatMessage]) -> str:
        for item in reversed(messages):
            if item.role == "user" and item.content.strip():
                return item.content
        return ""

    async def _classify(
        self,
        model: str,
        messages: list[dict],
        *,
        generation_name: str,
        max_tokens: int,
        identity_id: str | None = None,
    ) -> str:
        params: dict = {
            "model": model,
            "messages": messages,
            "caching": False,
            "fallbacks": [],
            "max_tokens": max_tokens,
            "metadata": {
                "generation_name": generation_name,
                "trace_name": generation_name,
                "tags": ["realmm", "guard"],
            },
        }
        try:
            response = await self._backend.acompletion(**params)
        except GuardBlockedError:
            raise
        except GuardConfigError:
            raise
        except Exception as exc:
            raise GuardConfigError(f"Guard {generation_name} call failed: {exc}") from exc
        usage = getattr(response, "usage", None)
        tokens = getattr(usage, "total_tokens", None) if usage is not None else None
        hidden = getattr(response, "_hidden_params", None)
        cached = isinstance(hidden, dict) and hidden.get("cache_hit") is True
        self._budget.record_usage(
            tokens=tokens,
            usd=self._budget.completion_usd(response, model),
            cached=cached,
            identity_id=identity_id,
        )
        choices = getattr(response, "choices", None)
        if not choices:
            raise GuardConfigError(f"Guard {generation_name} returned no choices.")
        message = getattr(choices[0], "message", None)
        content = getattr(message, "content", None) if message is not None else None
        if not isinstance(content, str):
            raise GuardConfigError(f"Guard {generation_name} returned no text.")
        return content

    async def scan_injection(self, text: str, flags: RuntimeFlags, *, identity_id: str | None = None) -> None:
        if not self.injection_enabled(flags) or not text.strip():
            return
        model = self._resolve_guard_model(self.requested_injection_model(), "injection")
        chunks = self._chunk_text(model, text)
        if not chunks:
            return

        async def _one(chunk: str) -> None:
            verdict = await self._classify(
                model,
                [{"role": "user", "content": chunk}],
                generation_name="guard-injection",
                max_tokens=_INJECTION_MAX_TOKENS,
                identity_id=identity_id,
            )
            if injection_is_malicious(verdict):
                raise GuardBlockedError("injection", "Prompt injection blocked.")

        await asyncio.gather(*[_one(chunk) for chunk in chunks])

    async def scan_content(
        self,
        text: str,
        role: str,
        flags: RuntimeFlags,
        *,
        identity_id: str | None = None,
    ) -> None:
        if not self.content_enabled(flags) or not text.strip():
            return
        if role not in {"user", "assistant"}:
            raise GuardConfigError("Llama Guard role must be user or assistant.")
        model = self._resolve_guard_model(self.requested_content_model(), "content")
        verdict = await self._classify(
            model,
            [{"role": role, "content": text}],
            generation_name="guard-content",
            max_tokens=_CONTENT_MAX_TOKENS,
            identity_id=identity_id,
        )
        unsafe, categories = parse_content_verdict(verdict)
        if not unsafe:
            return
        ignore = set(self.ignored_content_categories(strict=True))
        remaining = [code for code in categories if code not in ignore]
        if categories and not remaining:
            return
        names = category_names_for(remaining)
        label = ", ".join(remaining) if remaining else "unsafe"
        raise GuardBlockedError("content", f"Unsafe content blocked ({label}).", remaining, names)

    async def assert_inbound(
        self,
        messages: list[ChatMessage],
        flags: RuntimeFlags,
        *,
        identity_id: str | None = None,
    ) -> None:
        if not flags.guard:
            return
        self._ensure_scanners(flags)
        tasks = []
        if self.injection_enabled(flags):
            tasks.append(self.scan_injection(self._inbound_injection_blob(messages), flags, identity_id=identity_id))
        if self.content_enabled(flags):
            user_text = self._latest_user_text(messages)
            system_text = self._inbound_system_blob(messages)
            if user_text:
                tasks.append(self.scan_content(user_text, "user", flags, identity_id=identity_id))
            if system_text:
                tasks.append(self.scan_content(system_text, "user", flags, identity_id=identity_id))
        if tasks:
            await asyncio.gather(*tasks)

    async def assert_outbound(
        self,
        assistant: str,
        flags: RuntimeFlags,
        *,
        identity_id: str | None = None,
    ) -> None:
        if not flags.guard or not flags.guard_content:
            return
        self._ensure_scanners(flags)
        await self.scan_content(assistant, "assistant", flags, identity_id=identity_id)

    async def assert_memory_write(
        self,
        messages: list[ChatMessage],
        flags: RuntimeFlags,
        *,
        identity_id: str | None = None,
    ) -> None:
        if not flags.guard or not flags.guard_content:
            return
        self._ensure_scanners(flags)
        await self.scan_content(self._memory_write_blob(messages), "user", flags, identity_id=identity_id)
