from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Callable
from contextlib import contextmanager

from app.application.events import (
    StreamDelta,
    StreamEvent,
    StreamFallback,
    StreamFinished,
    StreamStarted,
    StreamUsage,
)
from app.application.models import ChatCommand, IdentityQuotas, PromptMeta, RuntimeFlags
from app.application.ports import (
    CompletionBackend,
    FlagStorePort,
    GuardPort,
    IdentityQuotaPort,
    MemoryPort,
    ModelCatalogPort,
    PiiPort,
    PromptPort,
    StageClock,
    UsageBudgetPort,
)
from app.schemas import ChatMessage, ChatResponse, UsageInfo
from app.structured import SchemaError, normalize_response_format, validate_output

logger = logging.getLogger(__name__)

_PII_STREAM_HOLDBACK = 64


def _injected_message_index(before: list[ChatMessage], after: list[ChatMessage]) -> int | None:
    if len(after) != len(before) + 1:
        return None
    for index, (left, right) in enumerate(zip(before, after)):
        if left.role != right.role or left.content != right.content:
            return index
    return len(before)


def _pii_commit(redacted: str, emitted: str, holdback: int = _PII_STREAM_HOLDBACK) -> tuple[str, str]:
    commit_end = max(0, len(redacted) - holdback)
    committed = redacted[:commit_end]
    if not committed.startswith(emitted):
        return "", emitted
    return committed[len(emitted) :], committed


class _NullClock:
    @contextmanager
    def stage(self, name: str):
        yield

    def snapshot(self) -> dict[str, float]:
        return {}


def _usage_from_response(response: object) -> UsageInfo | None:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None
    prompt_tokens = getattr(usage, "prompt_tokens", None)
    completion_tokens = getattr(usage, "completion_tokens", None)
    total_tokens = getattr(usage, "total_tokens", None)
    if prompt_tokens is None and completion_tokens is None and total_tokens is None:
        return None
    return UsageInfo(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
    )


def _hidden_params(response: object) -> dict:
    hidden = getattr(response, "_hidden_params", None)
    if isinstance(hidden, dict):
        return hidden
    if hidden is None:
        return {}
    dumped = getattr(hidden, "model_dump", None)
    if callable(dumped):
        data = dumped()
        return data if isinstance(data, dict) else {}
    return {}


def _cache_hit(response: object) -> bool:
    hidden = _hidden_params(response)
    if hidden.get("cache_hit") is True:
        return True
    return bool(getattr(response, "_cache_hit", False))


def _served_model(response: object, requested: str) -> str:
    hidden = _hidden_params(response)
    for key in ("model_group",):
        value = hidden.get(key)
        if isinstance(value, str) and value:
            return value
    model_name = getattr(response, "model", None)
    if isinstance(model_name, str) and model_name:
        if requested == model_name or requested.endswith(f"/{model_name}"):
            return requested
        return model_name
    return requested


def _completion_metadata(
    *,
    user_id: str | None = None,
    conversation_id: str | None = None,
    agent_id: str | None = None,
    prompt_meta: PromptMeta | None = None,
    generation_name: str | None = None,
) -> dict:
    name = generation_name or (prompt_meta.name if prompt_meta else "chat")
    tags = ["realmm"]
    if agent_id:
        tags.append(f"agent:{agent_id}")
    metadata: dict = {
        "generation_name": name,
        "trace_name": name,
        "tags": tags,
    }
    if user_id:
        metadata["trace_user_id"] = user_id
    if conversation_id:
        metadata["session_id"] = conversation_id
    if prompt_meta is not None:
        if prompt_meta.version is not None:
            metadata["version"] = str(prompt_meta.version)
        metadata["trace_metadata"] = {
            "prompt_name": prompt_meta.name,
            "prompt_source": prompt_meta.source,
        }
    return metadata


def _chunk_delta(chunk: object) -> str:
    choices = getattr(chunk, "choices", None)
    if not choices:
        return ""
    delta = getattr(choices[0], "delta", None)
    if delta is None:
        return ""
    return getattr(delta, "content", None) or ""


class ChatService:
    def __init__(
        self,
        *,
        flags: FlagStorePort,
        catalog: ModelCatalogPort,
        prompts: PromptPort,
        pii: PiiPort,
        memory: MemoryPort,
        guards: GuardPort,
        budget: UsageBudgetPort,
        backend: CompletionBackend,
        identities: IdentityQuotaPort | None = None,
        telemetry_factory: Callable[[], StageClock] | None = None,
    ):
        self._flags = flags
        self._catalog = catalog
        self._prompts = prompts
        self._pii = pii
        self._memory = memory
        self._guards = guards
        self._budget = budget
        self._backend = backend
        self._identities = identities
        self._telemetry_factory = telemetry_factory

    def _clock(self) -> StageClock:
        if self._telemetry_factory is None:
            return _NullClock()
        return self._telemetry_factory()

    def _quotas_for(self, identity_id: str | None) -> IdentityQuotas:
        if self._identities is None:
            return IdentityQuotas()
        return self._identities.quotas_for(identity_id)

    def _output_token_cap(self, command: ChatCommand) -> int:
        cap = self._budget.max_output_tokens()
        if command.max_tokens is None:
            return cap
        try:
            requested = int(command.max_tokens)
        except (TypeError, ValueError):
            return cap
        return max(1, min(requested, cap))

    def _completion_kwargs(
        self,
        command: ChatCommand,
        *,
        resolved: str,
        outgoing: list[ChatMessage],
        prompt_meta: PromptMeta | None,
        stream: bool,
    ) -> dict:
        call_kwargs: dict = {
            "model": resolved,
            "messages": [message.model_dump() for message in outgoing],
            "max_tokens": self._output_token_cap(command),
            "metadata": _completion_metadata(
                user_id=command.user_id,
                conversation_id=command.conversation_id,
                agent_id=command.agent_id,
                prompt_meta=prompt_meta,
            ),
        }
        fallbacks = self._backend.chat_fallback_ids(resolved)
        if fallbacks:
            call_kwargs["fallbacks"] = fallbacks
        if command.temperature is not None:
            call_kwargs["temperature"] = command.temperature
        if command.tools:
            call_kwargs["tools"] = command.tools
        if command.tool_choice is not None:
            call_kwargs["tool_choice"] = command.tool_choice
        if stream:
            call_kwargs["stream"] = True
            call_kwargs["caching"] = False
            call_kwargs["stream_options"] = {"include_usage": True}
        return call_kwargs

    async def _prepare_outgoing(self, command: ChatCommand, flags: RuntimeFlags):
        outgoing, prompt_meta = self._prompts.prepare_messages(
            command.messages,
            prompt=command.prompt,
            prompt_label=command.prompt_label,
            prompt_version=command.prompt_version,
            variables=command.variables,
        )
        pii_on = flags.pii
        found: list[str] = []
        if pii_on:
            outgoing, types = await self._pii.redact_messages(outgoing)
            found = self._pii.unique_entity_types(found, types)
        before_memory = outgoing
        outgoing, memories_used = await self._memory.attach(
            outgoing,
            flags,
            user_id=command.identity_id,
            conversation_id=command.conversation_id,
            agent_id=command.agent_id,
        )
        if pii_on and memories_used:
            index = _injected_message_index(before_memory, outgoing)
            if index is not None:
                redacted, types = await self._pii.redact_text(outgoing[index].content)
                outgoing = list(outgoing)
                outgoing[index] = ChatMessage(role=outgoing[index].role, content=redacted)
                found = self._pii.unique_entity_types(found, types)
        if flags.guard:
            await self._guards.assert_inbound(outgoing, flags, identity_id=command.identity_id)
        resolved = self._catalog.resolve_model(command.model)
        estimated = self._budget.token_count(resolved, outgoing)
        quotas = self._quotas_for(command.identity_id)
        self._budget.assert_rpm(command.identity_id, quotas.rpm_limit)
        reservation_id = self._budget.reserve(
            resolved,
            estimated,
            identity_id=command.identity_id,
            quotas=quotas,
        )
        return (
            outgoing,
            prompt_meta,
            memories_used,
            resolved,
            estimated,
            True if pii_on else None,
            found if pii_on else None,
            True if flags.guard else None,
            reservation_id,
        )

    async def complete(self, command: ChatCommand) -> ChatResponse:
        clock = self._clock()
        flags = self._flags.snapshot()
        fmt = normalize_response_format(command.response_format)
        reservation_id: str | None = None

        with clock.stage("preflight"):
            (
                outgoing,
                prompt_meta,
                memories_used,
                resolved,
                estimated,
                pii_redacted,
                pii_entities,
                guard_passed,
                reservation_id,
            ) = await self._prepare_outgoing(command, flags)
        call_kwargs = self._completion_kwargs(
            command,
            resolved=resolved,
            outgoing=outgoing,
            prompt_meta=prompt_meta,
            stream=False,
        )
        if fmt is not None:
            call_kwargs["response_format"] = fmt
        try:
            with clock.stage("provider"):
                response = await self._backend.acompletion(**call_kwargs)
            with clock.stage("postprocess"):
                choice = response.choices[0]
                content = choice.message.content or ""
                served = _served_model(response, resolved)
                used_fallback = self._catalog.fallback_from(resolved, served)
                reported = served if used_fallback else resolved
                cached = _cache_hit(response)
                usage = self._budget.attach_cost(
                    _usage_from_response(response), self._budget.completion_usd(response, reported)
                )
                tokens = usage.total_tokens if usage and usage.total_tokens is not None else estimated
                self._budget.record_usage(
                    tokens=tokens,
                    usd=usage.cost_usd if usage else None,
                    cached=cached,
                    identity_id=command.identity_id,
                    reservation_id=reservation_id,
                )
                reservation_id = None
                if pii_redacted:
                    content, found = await self._pii.redact_text(content)
                    pii_entities = self._pii.unique_entity_types(pii_entities or [], found)
                if guard_passed:
                    await self._guards.assert_outbound(content, flags, identity_id=command.identity_id)
                if fmt is not None:
                    validate_output(content, fmt)
                self._memory.schedule_record(
                    outgoing,
                    content,
                    flags,
                    user_id=command.identity_id,
                    conversation_id=command.conversation_id,
                    agent_id=command.agent_id,
                )
        finally:
            if reservation_id is not None:
                self._budget.release(reservation_id)
        logger.info(
            "chat complete stages_ms=%s identity=%s",
            clock.snapshot(),
            command.identity_id or "-",
        )
        return ChatResponse(
            model=reported,
            provider=self._catalog.provider_for_model(reported),
            message=ChatMessage(role="assistant", content=content),
            usage=usage,
            cached=cached,
            fallback_from=used_fallback,
            prompt_name=prompt_meta.name if prompt_meta else None,
            prompt_version=prompt_meta.version if prompt_meta else None,
            prompt_source=prompt_meta.source if prompt_meta else None,
            memories_used=memories_used,
            pii_redacted=pii_redacted,
            pii_entities=pii_entities,
            guard_passed=guard_passed,
            schema_valid=True if fmt is not None else None,
        )

    async def stream(self, command: ChatCommand) -> AsyncIterator[StreamEvent]:
        if command.response_format is not None:
            normalize_response_format(command.response_format)
            raise SchemaError("Structured output cannot be streamed. Omit stream or response_format.")

        clock = self._clock()
        flags = self._flags.snapshot()
        reservation_id: str | None = None
        with clock.stage("preflight"):
            (
                outgoing,
                prompt_meta,
                memories_used,
                resolved,
                estimated,
                pii_redacted,
                pii_entities,
                guard_passed,
                reservation_id,
            ) = await self._prepare_outgoing(command, flags)
        buffer_output = bool(pii_redacted) or bool(guard_passed and self._guards.content_enabled(flags))
        yield StreamStarted(
            model=resolved,
            provider=self._catalog.provider_for_model(resolved),
            prompt_meta=prompt_meta,
            memories_used=memories_used,
            pii_redacted=pii_redacted,
            pii_entities=pii_entities,
            guard_passed=guard_passed,
            buffered=buffer_output,
        )
        call_kwargs = self._completion_kwargs(
            command,
            resolved=resolved,
            outgoing=outgoing,
            prompt_meta=prompt_meta,
            stream=True,
        )
        served = resolved
        assembled: list[str] = []
        usage = None
        try:
            with clock.stage("provider"):
                stream = await self._backend.acompletion(**call_kwargs)
                async for chunk in stream:
                    chunk_model = getattr(chunk, "model", None)
                    if isinstance(chunk_model, str) and chunk_model:
                        served = _served_model(chunk, resolved)
                    delta = _chunk_delta(chunk)
                    if delta:
                        assembled.append(delta)
                    chunk_usage = _usage_from_response(chunk)
                    if chunk_usage is not None:
                        usage = chunk_usage
                    if buffer_output or not delta:
                        continue
                    yield StreamDelta(content=delta)
            with clock.stage("postprocess"):
                raw_assistant = "".join(assembled)
                if usage is None:
                    usage = self._budget.usage_from_counts(
                        served, estimated, self._budget.token_count_text(served, raw_assistant)
                    )
                elif usage.cost_usd is None:
                    completion_tokens = usage.completion_tokens
                    if completion_tokens is None:
                        completion_tokens = self._budget.token_count_text(served, raw_assistant)
                    prompt_tokens = usage.prompt_tokens if usage.prompt_tokens is not None else estimated
                    usage = self._budget.usage_from_counts(served, prompt_tokens, completion_tokens)
                tokens = usage.total_tokens if usage.total_tokens is not None else estimated
                self._budget.record_usage(
                    tokens=tokens,
                    usd=usage.cost_usd,
                    cached=False,
                    identity_id=command.identity_id,
                    reservation_id=reservation_id,
                )
                reservation_id = None
                assistant = raw_assistant
                if pii_redacted:
                    assistant, found = await self._pii.redact_text(raw_assistant)
                    pii_entities = self._pii.unique_entity_types(pii_entities or [], found)
                if guard_passed:
                    await self._guards.assert_outbound(assistant, flags, identity_id=command.identity_id)
                if buffer_output and assistant:
                    yield StreamDelta(content=assistant)
                self._memory.schedule_record(
                    outgoing,
                    assistant,
                    flags,
                    user_id=command.identity_id,
                    conversation_id=command.conversation_id,
                    agent_id=command.agent_id,
                )
        finally:
            if reservation_id is not None:
                self._budget.release(reservation_id)
        used_fallback = self._catalog.fallback_from(resolved, served)
        reported = served if used_fallback else resolved
        logger.info(
            "chat stream stages_ms=%s identity=%s",
            clock.snapshot(),
            command.identity_id or "-",
        )
        if used_fallback or served != resolved:
            yield StreamFallback(
                model=reported,
                provider=self._catalog.provider_for_model(reported),
                fallback_from=used_fallback,
            )
        yield StreamUsage(usage=usage, cost_usd=usage.cost_usd)
        yield StreamFinished(finish_reason="stop", model=reported, served=served)
