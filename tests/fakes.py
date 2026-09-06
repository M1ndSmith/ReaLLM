from __future__ import annotations

from types import SimpleNamespace


class FakeMessage:
    def __init__(self, content: str | None = "hello", tool_calls=None):
        self.content = content
        self.tool_calls = tool_calls


class FakeChoice:
    def __init__(self, content: str | None = "hello", delta_content: str | None = None, tool_calls=None):
        self.message = FakeMessage(content, tool_calls=tool_calls)
        self.delta = SimpleNamespace(content=delta_content)


class FakeUsage:
    def __init__(self, prompt_tokens=3, completion_tokens=2, total_tokens=5, cost_usd=None):
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.total_tokens = total_tokens
        self.cost_usd = cost_usd


class FakeResponse:
    def __init__(
        self,
        content: str | None = "hello",
        model: str = "groq/openai/gpt-oss-20b",
        *,
        cache_hit: bool = False,
        usage: FakeUsage | None = None,
        hidden: dict | None = None,
        tool_calls=None,
    ):
        self.choices = [FakeChoice(content, tool_calls=tool_calls)]
        self.model = model
        self.usage = FakeUsage() if usage is None else usage
        params = {"cache_hit": cache_hit, "model_group": model}
        if hidden:
            params.update(hidden)
        self._hidden_params = params


class FakeChunk:
    def __init__(self, content: str = "", model: str | None = None, usage: FakeUsage | None = None):
        self.choices = [FakeChoice(delta_content=content)]
        self.model = model
        self.usage = usage


class FakeGuardRouter:
    """Router that answers Prompt Guard / Llama Guard / chat from the model id."""

    def __init__(self, *, injection: str = "benign", content: str = "safe", chat: str = "hello there"):
        self.injection = injection
        self.content = content
        self.chat = chat
        self.calls: list[dict] = []

    async def acompletion(self, **kwargs):
        self.calls.append(dict(kwargs))
        model = kwargs.get("model") or ""
        if "prompt-guard" in model:
            return FakeResponse(self.injection, model=model)
        if "llama-guard" in model:
            return FakeResponse(self.content, model=model)
        if kwargs.get("stream"):
            async def _gen():
                yield FakeChunk(self.chat, model=model)
                yield FakeChunk("", usage=FakeUsage())

            return _gen()
        return FakeResponse(self.chat, model=model)
