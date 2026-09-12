from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    model: str = Field(..., min_length=1)
    messages: list[ChatMessage] = Field(..., min_length=1)
    stream: bool = False
    prompt: str | None = None
    prompt_label: str | None = None
    prompt_version: int | None = None
    variables: dict[str, str] | None = None
    user_id: str | None = None
    conversation_id: str | None = None
    agent_id: str | None = None
    response_format: dict | None = None
    temperature: float | None = None
    max_tokens: int | None = Field(default=None, ge=1)
    tools: list | None = None
    tool_choice: str | dict | None = None


class OpenAIChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    model: str = Field(..., min_length=1)
    messages: list[ChatMessage] = Field(..., min_length=1)
    stream: bool = False
    user: str | None = None
    prompt: str | None = None
    prompt_label: str | None = None
    prompt_version: int | None = None
    variables: dict[str, str] | None = None
    user_id: str | None = None
    conversation_id: str | None = None
    agent_id: str | None = None
    response_format: dict | None = None
    temperature: float | None = None
    max_tokens: int | None = Field(default=None, ge=1)
    tools: list | None = None
    tool_choice: str | dict | None = None


class EmbeddingRequest(BaseModel):
    model: str = Field(..., min_length=1)
    input: str | list[str]
    user: str | None = None
    encoding_format: str | None = None


class ConfigLayers(BaseModel):
    memory: bool | None = None
    pii: bool | None = None
    guard: bool | None = None
    guard_injection: bool | None = None
    guard_content: bool | None = None


class ConfigPatch(BaseModel):
    layers: ConfigLayers = Field(default_factory=ConfigLayers)


class IdentityQuotasPayload(BaseModel):
    daily_token_budget: int | None = None
    daily_usd_budget: float | None = None
    rpm: int | None = None


class IdentityPublic(BaseModel):
    id: str
    scopes: list[str] = Field(default_factory=list)
    label: str | None = None
    created_at: str | None = None
    revoked_at: str | None = None
    last_used_at: str | None = None
    quotas: IdentityQuotasPayload = Field(default_factory=IdentityQuotasPayload)


class GatewayKeyCreate(BaseModel):
    key_id: str = Field(..., min_length=1)
    scopes: list[str] = Field(..., min_length=1)
    label: str | None = None
    secret: str | None = None
    quotas: IdentityQuotasPayload | None = None


class GatewayKeyPatch(BaseModel):
    scopes: list[str] | None = None
    label: str | None = None
    revoked: bool | None = None
    quotas: IdentityQuotasPayload | None = None


class GatewayKeyCreated(BaseModel):
    key: IdentityPublic
    secret: str


class GatewayKeyListResponse(BaseModel):
    keys: list[IdentityPublic] = Field(default_factory=list)


class ConfigResponse(BaseModel):
    auth_required: bool
    layers: ConfigLayers
    restart_for: list[str]
    identity: IdentityPublic | None = None


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
    cache_ttl: int | None = None
    redis: bool = False
    redis_mode: str | None = None
    fallback_policy: str | None = None
    fallbacks: list[str]
    routing_strategy: str


class PromptsInfo(BaseModel):
    enabled: bool
    source: str
    tracing: bool = False


class PromptListItem(BaseModel):
    name: str
    source: str


class PromptsResponse(BaseModel):
    prompts: list[PromptListItem]


class BudgetInfo(BaseModel):
    daily_tokens: int
    daily_token_limit: int | None = None
    daily_usd: float
    daily_usd_limit: float | None = None
    max_input_tokens: int | None = None
    max_output_tokens: int
    ledger: str = "file"


class MemoryInfo(BaseModel):
    enabled: bool
    llm: str | None = None
    embedder: str | None = None
    vector: str | None = None


class PiiInfo(BaseModel):
    enabled: bool
    engine: str | None = None
    entities: list[str] = Field(default_factory=list)


class GuardInfo(BaseModel):
    enabled: bool
    injection: bool = False
    content: bool = False
    injection_model: str | None = None
    content_model: str | None = None
    content_ignore: list[str] = Field(default_factory=list)


class MemoryHit(BaseModel):
    id: str | None = None
    memory: str
    score: float | None = None


class MemorySearchResponse(BaseModel):
    results: list[MemoryHit]


class MemoryAddRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)
    user_id: str | None = None
    conversation_id: str | None = None
    agent_id: str | None = None


class MemoryAddResponse(BaseModel):
    results: list[dict] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    providers: list[str]
    reliability: ReliabilityInfo | None = None
    prompts: PromptsInfo | None = None
    budget: BudgetInfo | None = None
    memory: MemoryInfo | None = None
    pii: PiiInfo | None = None
    guard: GuardInfo | None = None


class UsageInfo(BaseModel):
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    cost_usd: float | None = None


class ChatResponse(BaseModel):
    model: str
    provider: str
    message: ChatMessage
    usage: UsageInfo | None = None
    cached: bool = False
    fallback_from: str | None = None
    prompt_name: str | None = None
    prompt_version: int | None = None
    prompt_source: str | None = None
    memories_used: int | None = None
    pii_redacted: bool | None = None
    pii_entities: list[str] | None = None
    guard_passed: bool | None = None
    schema_valid: bool | None = None
