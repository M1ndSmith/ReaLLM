from __future__ import annotations

from collections.abc import AsyncIterator

from app.application.events import (
    StreamDelta,
    StreamEvent,
    StreamFallback,
    StreamFinished,
    StreamStarted,
    StreamUsage,
)
from app.application.models import ChatCommand, PromptMeta, RuntimeFlags
from app.application.ports import (
    CompletionBackend,
    FlagStorePort,
    GuardPort,
    MemoryPort,
    ModelCatalogPort,
    PiiPort,
    PromptPort,
    UsageBudgetPort,
)
from app.schemas import ChatMessage, ChatResponse, UsageInfo
from app.structured import SchemaError, normalize_response_format, validate_output


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
    ):
        self._flags = flags
        self._catalog = catalog
        self._prompts = prompts
        self._pii = pii
        self._memory = memory
        self._guards = guards
        self._budget = budget
        self._backend = backend

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
        outgoing, memories_used = await self._memory.attach(
            outgoing,
            flags,
            user_id=command.user_id,
            conversation_id=command.conversation_id,
            agent_id=command.agent_id,
        )
        if pii_on:
            outgoing, types = await self._pii.redact_messages(outgoing)
            found = self._pii.unique_entity_types(found, types)
        if flags.guard:
            await self._guards.assert_inbound(outgoing, flags)
        resolved = self._catalog.resolve_model(command.model)
        estimated = self._budget.token_count(resolved, outgoing)
        self._budget.assert_allowed(resolved, estimated)
        return (
            outgoing,
            prompt_meta,
            memories_used,
            resolved,
            estimated,
            True if pii_on else None,
            found if pii_on else None,
            True if flags.guard else None,
        )

    async def complete(self, command: ChatCommand) -> ChatResponse:
        flags = self._flags.snapshot()
        fmt = normalize_response_format(command.response_format)

        (
            outgoing,
            prompt_meta,
            memories_used,
            resolved,
            estimated,
            pii_redacted,
            pii_entities,
            guard_passed,
        ) = await self._prepare_outgoing(command, flags)
        fallbacks = self._backend.chat_fallback_ids(resolved)
        call_kwargs: dict = {
            "model": resolved,
            "messages": [message.model_dump() for message in outgoing],
            "max_tokens": self._budget.max_output_tokens(),
            "metadata": _completion_metadata(
                user_id=command.user_id,
                conversation_id=command.conversation_id,
                agent_id=command.agent_id,
                prompt_meta=prompt_meta,
            ),
        }
        if fallbacks:
            call_kwargs["fallbacks"] = fallbacks
        if fmt is not None:
            call_kwargs["response_format"] = fmt
        response = await self._backend.acompletion(**call_kwargs)
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
        self._budget.record_usage(tokens=tokens, usd=usage.cost_usd if usage else None, cached=cached)
        if pii_redacted:
            content, found = await self._pii.redact_text(content)
            pii_entities = self._pii.unique_entity_types(pii_entities or [], found)
        if guard_passed:
            await self._guards.assert_outbound(content, flags)
        if fmt is not None:
            validate_output(content, fmt)
        self._memory.schedule_record(
            outgoing,
            content,
            flags,
            user_id=command.user_id,
            conversation_id=command.conversation_id,
            agent_id=command.agent_id,
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

        flags = self._flags.snapshot()
        (
            outgoing,
            prompt_meta,
            memories_used,
            resolved,
            estimated,
            pii_redacted,
            pii_entities,
            guard_passed,
        ) = await self._prepare_outgoing(command, flags)
        yield StreamStarted(
            model=resolved,
            provider=self._catalog.provider_for_model(resolved),
            prompt_meta=prompt_meta,
            memories_used=memories_used,
            pii_redacted=pii_redacted,
            pii_entities=pii_entities,
            guard_passed=guard_passed,
        )
        fallbacks = self._backend.chat_fallback_ids(resolved)
        call_kwargs: dict = {
            "model": resolved,
            "messages": [message.model_dump() for message in outgoing],
            "stream": True,
            "caching": False,
            "max_tokens": self._budget.max_output_tokens(),
            "stream_options": {"include_usage": True},
            "metadata": _completion_metadata(
                user_id=command.user_id,
                conversation_id=command.conversation_id,
                agent_id=command.agent_id,
                prompt_meta=prompt_meta,
            ),
        }
        if fallbacks:
            call_kwargs["fallbacks"] = fallbacks
        stream = await self._backend.acompletion(**call_kwargs)
        served = resolved
        assembled: list[str] = []
        usage = None
        buffer_output = bool(pii_redacted) or bool(guard_passed and self._guards.content_enabled(flags))
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
            if not buffer_output and delta:
                yield StreamDelta(content=delta)
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
        self._budget.record_usage(tokens=tokens, usd=usage.cost_usd, cached=False)
        assistant = raw_assistant
        if pii_redacted:
            assistant, found = await self._pii.redact_text(raw_assistant)
            pii_entities = self._pii.unique_entity_types(pii_entities or [], found)
        if guard_passed:
            await self._guards.assert_outbound(assistant, flags)
        if buffer_output and assistant:
            yield StreamDelta(content=assistant)
        self._memory.schedule_record(
            outgoing,
            assistant,
            flags,
            user_id=command.user_id,
            conversation_id=command.conversation_id,
            agent_id=command.agent_id,
        )
        used_fallback = self._catalog.fallback_from(resolved, served)
        reported = served if used_fallback else resolved
        if used_fallback or served != resolved:
            yield StreamFallback(
                model=reported,
                provider=self._catalog.provider_for_model(reported),
                fallback_from=used_fallback,
            )
        yield StreamUsage(usage=usage, cost_usd=usage.cost_usd)
        yield StreamFinished(finish_reason="stop", model=reported, served=served)
