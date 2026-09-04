from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    model: str = Field(..., min_length=1)
    messages: list[ChatMessage] = Field(..., min_length=1)
    stream: bool = False


class ModelInfo(BaseModel):
    id: str
    provider: str


class ModelsResponse(BaseModel):
    providers: list[str]
    models: list[ModelInfo]


class ProvidersResponse(BaseModel):
    providers: list[str]


class ReliabilityInfo(BaseModel):
    retries: int
    cache: bool
    fallbacks: list[str]
    routing_strategy: str


class HealthResponse(BaseModel):
    status: str
    providers: list[str]
    reliability: ReliabilityInfo | None = None


class UsageInfo(BaseModel):
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


class ChatResponse(BaseModel):
    model: str
    provider: str
    message: ChatMessage
    usage: UsageInfo | None = None
    cached: bool = False
    fallback_from: str | None = None
