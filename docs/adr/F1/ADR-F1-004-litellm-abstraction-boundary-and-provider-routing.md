# ADR-F1-004 — LiteLLM Abstraction Boundary and Provider Routing

| Field        | Value                                          |
|--------------|------------------------------------------------|
| **Status**   | Accepted                                       |
| **Phase**    | F1                                             |
| **Author**   | OCTO Architecture                              |
| **Created**  | 2026-05-21                                     |
| **Enriched** | 2026-05-22                                     |
| **Supersedes** | ADR-F1-004 (Proposed, 2026-05-21)            |
| **Labels**   | `phase:F1` · `area:architecture` · `type:adr` · `priority:critical` · `status:accepted` |

---

## Context

OCTO must support multiple LLM providers (OpenAI, Anthropic, Google, Groq, local models via Ollama, etc.) without coupling the runtime core to any vendor SDK. Provider selection, fallback, rate limiting, token accounting, and timeout policy must be configurable per agent, per workspace, per department, and per agency in the hierarchy. Any vendor migration must be transparent to the runtime core.

The architecture mandate is explicit:

> **The runtime must never directly depend on vendor SDKs. All providers are abstracted behind adapters. Architecture: Runtime → Provider Abstraction Layer → LiteLLM → Providers.**

### Alternative Models Evaluated

| Model | Description | Rejection Reason |
|---|---|---|
| Direct vendor SDKs | Runtime core imports `openai`, `anthropic`, etc. directly | Violates provider abstraction mandate; vendor lock-in |
| Custom proxy without LiteLLM | Build in-house translation layer for 100+ providers | Duplicates LiteLLM's normalization work; high maintenance |
| LangChain model abstractions | Heavy dependency not aligned with minimal runtime footprint | Adds unnecessary weight; OCTO's runtime worker must remain lean |

### Reference Implementations Analyzed

| Framework | LiteLLM usage |
|---|---|
| CrewAI | Native SDKs with LiteLLM as fallback for 100+ providers |
| LangGraph | LiteLLM as model gateway (copilotkit-starter-langgraph-litellm) |
| Semantic Kernel | AI service connector abstraction (`IChatCompletion`) |
| Microsoft Agent Framework | Provider-agnostic design; `Client` class backed by LiteLLM |
| n8n / LLemonStack | LiteLLM as unified gateway with Langfuse observability |
| AutoGen | LiteLLM proxy for non-OpenAI models (including local Ollama) |
| Paperclip | Budget governance across providers; per-call cost tracking |

---

## Decision

**OCTO F1 uses LiteLLM as the single gateway for all LLM provider calls, accessed exclusively through a `LLMProvider` interface defined in `packages/sdk-abstractions` (TS) and `app/contracts/llm.py` (Python).**

---

## 1. Boundary Definition

The boundary between the runtime core and the provider layer is strict: no import of `openai`, `anthropic`, `google-generativeai`, or any provider SDK is allowed outside the LiteLLM adapter. The runtime worker only knows the `LLMProvider` interface; the concrete implementation is injected at startup.

```
runtime-worker (Python)
  └─ imports only from app.adapters.llm (exposes LLMProvider interface)
       └─ LiteLLMAdapter (concrete adapter, knows LiteLLM)
            └─ LiteLLM Proxy (separate container)
                 └─ Provider SDKs (OpenAI, Anthropic, Google, Groq, Ollama, ...)
```

**Vendor isolation is a technical invariant, not a recommendation.** LiteLLM supports many LLM providers out of the box, handles provider detection automatically from model names, normalizes responses across all providers, and provides built-in model metadata. Provider API changes are isolated: when OpenAI, Anthropic, or Bedrock update their APIs, LiteLLM absorbs the change; the runtime code remains untouched.

---

## 2. Interface Contract

Defined in `packages/sdk-abstractions/src/llm.ts` (TS) and `app/contracts/llm.py` (Python). The runtime calls `provider.chat(request)` and `provider.stream(request)` only. See `[F1-CTR-001]` for full interface.

### TypeScript interface

```typescript
export type FinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error';

export interface CanonicalChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<Record<string, unknown>>;
  name?: string;
  toolCallId?: string;
}

export interface CanonicalToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatCompletionRequest {
  tenantId: string;
  executionId: string;
  agentId: string;
  model: string;                  // LiteLLM format: provider/model-name
  temperature: number;
  maxOutputTokens: number;
  stream: boolean;
  timeoutMs: number;
  messages: CanonicalChatMessage[];
  tools?: CanonicalToolDefinition[];
  providerParams?: Record<string, unknown>; // allowlisted per provider
  metadata?: Record<string, string>;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  provider: string;
  model: string;
  estimatedCostUsd: string;       // Decimal string to avoid float precision loss
}

export interface ChatCompletionResponse {
  id: string;
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    argumentsJson: string;
  }>;
  finishReason: FinishReason;
  usage: ChatUsage;
  raw: Record<string, unknown>;
}

export interface LLMProvider {
  chat(req: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  stream(req: ChatCompletionRequest): AsyncIterable<Record<string, unknown>>;
}
```

### Python interface

```python
from abc import ABC, abstractmethod
from decimal import Decimal
from typing import Any, AsyncIterable, Literal
from pydantic import BaseModel


class CanonicalChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str | list[dict[str, Any]]
    name: str | None = None
    tool_call_id: str | None = None


class CanonicalToolDefinition(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any]


class ChatCompletionRequest(BaseModel):
    tenant_id: str
    execution_id: str
    agent_id: str
    model: str                       # LiteLLM format: provider/model-name
    temperature: float = 0.2
    max_output_tokens: int = 2048
    stream: bool = False
    timeout_ms: int = 90_000
    messages: list[CanonicalChatMessage]
    tools: list[CanonicalToolDefinition] | None = None
    provider_params: dict[str, Any] | None = None  # allowlisted per provider
    metadata: dict[str, str] | None = None


class ChatUsage(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int
    provider: str
    model: str
    estimated_cost_usd: Decimal


class ChatCompletionResponse(BaseModel):
    id: str
    content: str
    tool_calls: list[dict[str, Any]] | None = None
    finish_reason: Literal["stop", "tool_calls", "length", "content_filter", "error"]
    usage: ChatUsage
    raw: dict[str, Any]


class LLMProvider(ABC):
    @abstractmethod
    async def chat(self, req: ChatCompletionRequest) -> ChatCompletionResponse:
        ...

    @abstractmethod
    async def stream(self, req: ChatCompletionRequest) -> AsyncIterable[dict[str, Any]]:
        ...
```

---

## 3. Provider Routing

Model resolution follows the hierarchy precedence defined in the OCTO architecture:

```
agent.modelPolicy.primaryModel
  → if absent: workspace.modelPolicy.primaryModel
  → if absent: department.modelPolicy.primaryModel
  → if absent: agency.modelPolicy.primaryModel
  → if absent: global.defaultModel
```

Fallback chain is resolved the same way. The resolved model string uses LiteLLM format: `provider/model-name`.

### Model string examples

| Model string | Provider | Notes |
|---|---|---|
| `openai/gpt-4.1-mini` | OpenAI | Standard routing |
| `anthropic/claude-3-5-haiku` | Anthropic | Standard routing |
| `gemini/gemini-2.0-flash` | Google | Standard routing |
| `groq/llama-3.3-70b` | Groq | Standard routing |
| `ollama/llama3` | Ollama (local) | Local inference |
| `command-r-plus` | Cohere | Prefix-less accepted by LiteLLM |

All model strings persisted in execution rows **must** use the `provider/model` format (Invariant I-A3).

### Provider-specific capabilities

Provider-specific parameters may be passed through the optional `provider_params` field. These must be validated against an allowlist per provider before being forwarded to the LiteLLM Proxy. Parameters not in the allowlist are dropped with a structured log warning. If a dropped parameter was declared as `required` by the agent policy, an alert is raised.

LiteLLM's `drop_params: true` mode silently discards unsupported parameters. OCTO overrides this with explicit logging so parameter loss is never silent.

---

## 4. Timeout and Retry

| Policy | Value | Override |
|---|---|---|
| Per-call timeout | 90s | Agent policy (max 300s) |
| Retry attempts | 3 | Exponential backoff: 2s, 10s, 30s |
| Retried conditions | HTTP 429, 408, 5xx | — |
| Circuit breaker threshold | 5 failures in 60s → OPEN | — |
| Circuit half-open delay | 30s | — |
| Circuit state storage | Redis | Key: `octo:{tenant_id}:circuit:{provider}:{model}` |

Connection pooling and keep-alives are managed by the LiteLLM Proxy. The adapter must be configured with appropriate timeouts and connection limits to prevent socket exhaustion under load.

---

## 5. Token Accounting

Every `ChatCompletionResponse` includes `usage: ChatUsage`. The runtime **MUST** persist the following in `execution_steps.metadata_json` for every LLM call:

- `input_tokens`
- `output_tokens`
- `total_tokens`
- `estimated_cost_usd`
- `provider`
- `model`
- `latency_ms`

**This is not optional.** Token accounting failure must not prevent execution result from being persisted. Accounting errors are logged and alerted separately (Invariant I-A4).

OCTO leverages LiteLLM's built-in cost tracking for per-run cost attribution and hierarchical budget enforcement. Each request carries `tenant_id`, `execution_id`, and `agent_id` in the LiteLLM metadata field.

---

## 6. Tenant Isolation

In F1, isolation is at the OCTO budget governance layer:

- LiteLLM `metadata` carries `tenant_id`, `execution_id`, `agent_id` on every request.
- Circuit breaker state is tenant-isolated (key includes `tenant_id`).
- Budget evaluation uses `budget_snapshot_json` captured at execution start.

LiteLLM virtual keys per tenant are reserved for F2+ to provide gateway-level billing isolation.

---

## 7. LiteLLM Proxy Mode (Required)

OCTO **requires** the LiteLLM Proxy mode (not embedded `litellm.completion()`). The architecture mandates that runtime workers never hold provider API keys. API keys are managed at the Control Plane and injected into the LiteLLM Proxy configuration at startup.

### LiteLLM Proxy configuration (`config.yaml`)

```yaml
model_list:
  - model_name: gpt-4.1-mini
    litellm_params:
      model: openai/gpt-4.1-mini
      api_key: ${OPENAI_API_KEY}
  - model_name: claude-3-5-haiku
    litellm_params:
      model: anthropic/claude-3-5-haiku
      api_key: ${ANTHROPIC_API_KEY}
  - model_name: gemini-2.0-flash
    litellm_params:
      model: gemini/gemini-2.0-flash
      api_key: ${GEMINI_API_KEY}
  - model_name: llama3
    litellm_params:
      model: ollama/llama3
      api_base: http://ollama:11434

litellm_settings:
  drop_params: false           # OCTO manages param validation explicitly
  set_verbose: false

general_settings:
  master_key: ${LITELLM_MASTER_KEY}
  database_url: ${LITELLM_DATABASE_URL}
```

---

## 8. LiteLLMAdapter Implementation

```python
import time
from openai import AsyncOpenAI
from app.contracts.llm import (
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatUsage,
    LLMProvider,
)
from app.adapters.llm_errors import map_error
from decimal import Decimal


class LiteLLMAdapter(LLMProvider):
    """Adapter that communicates with the LiteLLM Proxy via OpenAI-compatible API.
    This is the ONLY class that knows about the LiteLLM Proxy URL and key.
    """

    def __init__(self, proxy_url: str, proxy_api_key: str) -> None:
        self._client = AsyncOpenAI(
            base_url=f"{proxy_url}/v1",
            api_key=proxy_api_key,
            timeout=90.0,
            max_retries=0,  # Retry policy is owned by OCTO RetryPolicyEngine
        )

    async def chat(self, req: ChatCompletionRequest) -> ChatCompletionResponse:
        started_at = time.monotonic()
        try:
            response = await self._client.chat.completions.create(
                model=req.model,
                messages=[m.model_dump(exclude_none=True) for m in req.messages],
                tools=(
                    [
                        {
                            "type": "function",
                            "function": {
                                "name": t.name,
                                "description": t.description,
                                "parameters": t.input_schema,
                            },
                        }
                        for t in req.tools
                    ]
                    if req.tools
                    else None
                ),
                tool_choice="auto" if req.tools else None,
                temperature=req.temperature,
                max_tokens=req.max_output_tokens,
                timeout=req.timeout_ms / 1000,
                extra_headers={
                    "x-tenant-id": req.tenant_id,
                    "x-execution-id": req.execution_id,
                    "x-agent-id": req.agent_id,
                },
                extra_body=req.provider_params or {},
            )
            latency_ms = int((time.monotonic() - started_at) * 1000)
            return self._to_canonical(response, req.model, latency_ms)
        except Exception as exc:
            raise map_error(exc) from exc

    async def stream(self, req: ChatCompletionRequest):
        async with await self._client.chat.completions.create(
            model=req.model,
            messages=[m.model_dump(exclude_none=True) for m in req.messages],
            temperature=req.temperature,
            max_tokens=req.max_output_tokens,
            stream=True,
            timeout=req.timeout_ms / 1000,
            extra_headers={
                "x-tenant-id": req.tenant_id,
                "x-execution-id": req.execution_id,
                "x-agent-id": req.agent_id,
            },
        ) as stream:
            async for chunk in stream:
                yield chunk.model_dump()

    def _to_canonical(
        self, response, model: str, latency_ms: int
    ) -> ChatCompletionResponse:
        choice = response.choices[0]
        usage = response.usage
        provider = model.split("/")[0] if "/" in model else "unknown"
        tool_calls = None
        if choice.message.tool_calls:
            tool_calls = [
                {
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments_json": tc.function.arguments,
                }
                for tc in choice.message.tool_calls
            ]
        return ChatCompletionResponse(
            id=response.id,
            content=choice.message.content or "",
            tool_calls=tool_calls,
            finish_reason=choice.finish_reason or "stop",
            usage=ChatUsage(
                input_tokens=usage.prompt_tokens if usage else 0,
                output_tokens=usage.completion_tokens if usage else 0,
                total_tokens=usage.total_tokens if usage else 0,
                provider=provider,
                model=model,
                estimated_cost_usd=Decimal(
                    str(getattr(usage, "_hidden_params", {}).get("response_cost", 0))
                ),
            ),
            raw=response.model_dump(),
        )
```

---

## 9. Circuit Breaker Implementation (Redis)

```python
import time
from enum import Enum
from app.infrastructure.redis import RedisClient


class CircuitState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitOpenError(Exception):
    pass


class CircuitBreaker:
    FAILURE_THRESHOLD = 5
    OPEN_TTL_SECONDS = 60
    HALF_OPEN_AFTER_SECONDS = 30

    def __init__(
        self,
        redis: RedisClient,
        tenant_id: str,
        provider: str,
        model: str,
    ) -> None:
        clean_model = model.replace("/", ":")
        self._key = f"octo:{tenant_id}:circuit:{provider}:{clean_model}"
        self._failures_key = f"{self._key}:failures"
        self._redis = redis

    async def call(self, func, *args, **kwargs):
        state = await self._get_state()
        if state == CircuitState.OPEN:
            raise CircuitOpenError(f"Circuit OPEN for {self._key}")
        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except Exception as exc:
            await self._on_failure()
            raise exc

    async def _get_state(self) -> CircuitState:
        open_flag = await self._redis.get(self._key)
        if open_flag:
            # Check if we can transition to HALF_OPEN
            ttl = await self._redis.ttl(self._key)
            if ttl <= (self.OPEN_TTL_SECONDS - self.HALF_OPEN_AFTER_SECONDS):
                return CircuitState.HALF_OPEN
            return CircuitState.OPEN
        return CircuitState.CLOSED

    async def _on_failure(self) -> None:
        count = await self._redis.incr(self._failures_key)
        await self._redis.expire(self._failures_key, self.OPEN_TTL_SECONDS)
        if count >= self.FAILURE_THRESHOLD:
            await self._redis.set(self._key, "1", ex=self.OPEN_TTL_SECONDS)
            await self._redis.delete(self._failures_key)

    async def _on_success(self) -> None:
        await self._redis.delete(self._key)
        await self._redis.delete(self._failures_key)
```

---

## 10. Error Mapping Matrix

| LiteLLM/Provider condition | Canonical code | Retry? | State effect |
|---|---|---|---|
| HTTP 429 | `LLM_RATE_LIMITED` | yes | retry/fallback |
| HTTP 408 / timeout | `LLM_TIMEOUT` | yes | retry |
| HTTP 5xx | `LLM_PROVIDER_UNAVAILABLE` | yes | retry/fallback |
| Malformed request payload | `LLM_BAD_REQUEST` | no | failed |
| Unsupported model string | `LLM_MODEL_NOT_ALLOWED` | no | failed |
| Content filter triggered | `LLM_CONTENT_FILTERED` | no | failed or redacted output |
| Provider auth failure | `LLM_PROVIDER_AUTH_FAILED` | no | failed + ops alert |
| Invalid tool call JSON from model | `LLM_TOOL_CALL_INVALID` | yes once (re-prompt) | fail after re-prompt |
| Empty / null response | `LLM_EMPTY_RESPONSE` | yes once | retry |
| Budget exhausted before call | `LLM_BUDGET_EXCEEDED` | no | paused or failed |
| Circuit breaker OPEN | `LLM_CIRCUIT_OPEN` | no | fail fast |
| Provider-specific param dropped | `LLM_PARAM_DROPPED` | n/a | warning only; alert if required |

---

## 11. Invariants

### I-A1: No Provider SDK in Runtime Core
No import of `openai`, `anthropic`, `google-generativeai`, `boto3` (Bedrock), or any provider SDK is permitted outside of `apps/runtime-worker/app/adapters/` files.

```bash
# CI static analysis check — must return 0 matches:
grep -r "^import openai\|^from openai\|^import anthropic\|^from anthropic" \
  apps/runtime-worker/app/ \
  --include="*.py" \
  --exclude-dir=adapters
```

### I-A2: No Direct HTTP Calls to Provider APIs
No direct HTTP call to `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, or similar from the runtime core.

### I-A3: Model String Format
All model strings persisted in `executions.agent_version_id` snapshot, `execution_steps.metadata_json`, and `tool_invocations` must use `provider/model` format.

### I-A4: Token Accounting Mandatory but Non-Blocking
Token accounting failure must not prevent execution result from being persisted. Accounting errors are logged (`level=error, event=token_accounting_failed`) and trigger a metric counter `octo_token_accounting_failure_total`.

### I-A5: Circuit Breaker Per Provider-Model, Tenant-Isolated
Circuit state stored in Redis with key pattern:
```
octo:{tenant_id}:circuit:{provider}:{model}
```
Circuit state must never be shared across tenants.

### I-A6: Budget Pre-Evaluation Before Each LLM Call
The runtime MUST evaluate effective budget policy against cumulative spend (`sum(execution_steps.metadata_json->>'estimated_cost_usd')`) before dispatching each LLM call. Budget evaluation uses `budget_snapshot_json` captured at execution start (ADR-F1-001 I-8).

### I-A7: Provider-Specific Parameter Allowlist
Provider-specific parameters passed through `provider_params` must be validated against an allowlist per provider. Parameters not in the allowlist are dropped with a structured log warning at `level=warn, event=provider_param_dropped`. If the dropped parameter was declared `required` by the agent policy, an alert fires.

---

## 12. Consequences

### Positive

| Consequence | Validation |
|---|---|
| Provider migration requires only adapter change, not runtime change | Redis agent-memory-server pattern shows LiteLLM isolates provider API changes |
| LiteLLM handles payload normalization, retry, and error mapping | Thoughtworks notes LiteLLM addresses cross-cutting concerns: retries, failover, load balancing |
| Token accounting is centralized and auditable | MAF/OTel: every agent action includes performance monitoring |
| Testability: runtime tests mock `LLMProvider`, not provider HTTP | Semantic Kernel `IChatCompletion` validates the same pattern |
| Unified governance: rate limiting, circuit breakers, budget enforcement at one layer | Thoughtworks highlights governance concerns at the gateway level |

### Negative

| Negative | Mitigation |
|---|---|
| LiteLLM is an additional process to operate | Containerized deployment with health checks; battle-tested in production stacks |
| LiteLLM bugs affect all providers simultaneously | Exact version pinning; staging validation before upgrades |
| Provider-specific features not exposed by LiteLLM | `provider_params` with allowlist validation |
| `drop_params` may silently discard parameters | Logging on every drop; alert if `required` capability dropped |
| LiteLLM supply-chain risk (PyPI incidents) | Pin exact versions, verify checksums, SBOM (CycloneDX), Trivy scan |

---

## 13. Cross-Reference Validation

### CrewAI
CrewAI supports prefix-based routing identical to OCTO's design. OCTO diverges: LiteLLM is the primary and only path (no native SDK path in core). CrewAI community requests for custom OAuth2-secured LLMs via LiteLLM document that enterprise providers require dynamic token fetch; OCTO's `LiteLLMAdapter` must support this in F2+.

### LangGraph
LangGraph's `copilotkit-starter-langgraph-litellm` validates the design: the runtime core does not know which model is behind the `provider/model` string. The adapter translates to LiteLLM's `litellm.completion()` call.

### Semantic Kernel
Semantic Kernel's `IChatCompletion` abstraction is the closest analog to OCTO's `LLMProvider` interface. SK still requires provider-specific `PromptExecutionSettings`; OCTO avoids this by pushing all provider specifics into the LiteLLM adapter.

### Microsoft Agent Framework
MAF's provider-agnostic design and `Client` class pattern match OCTO's adapter. MAF includes durability (pause/resume/recover) as a core feature, confirming that provider abstraction and durable execution are complementary concerns (ADR-F1-001 ↔ ADR-F1-004).

### n8n / LLemonStack
Production deployment of n8n + LiteLLM + Langfuse validates LiteLLM as a production-tested gateway for multi-provider agent platforms. n8n uses LiteLLM as the default LLM proxy for centralized access, security guardrails, and observability.

### AutoGen
AutoGen explicitly lists LiteLLM as an OpenAI-compatible proxy for local models (Ollama). The pattern validates OCTO's design for local inference routing (`ollama/llama3` model string).

### Paperclip
Paperclip's budget governance model — budget evaluated before each LLM call, not only at execution start — is adopted as Invariant I-A6. Per-step `estimated_cost_usd` tracking and circuit breaker per provider:model are directly inspired by Paperclip.

### Microsoft AI Agents for Beginners (Production Patterns)
- **Observability:** Without observability, agents are "black boxes". OCTO's mandatory `trace_id + execution_id + agent_id + tenant_id` on every LLM call (via LiteLLM metadata) makes agents "glass boxes".
- **Cost management:** Per-step token and cost persistence enables identifying excessively expensive operations and optimizing model selection.
- **Agentic protocols:** MCP tool compatibility (ADR-F1-007) does not conflict with LiteLLM as the primary model gateway. These are orthogonal concerns.

---

## 14. Non-Goals (Confirmed for F1)

| Excluded Feature | Phase | Rationale |
|---|---|---|
| Multi-provider load balancing (active-active) | F2+ | LiteLLM supports it; F1 uses primary → fallback routing only |
| Distributed tracing across LiteLLM and runtime (Langfuse/OTel integration) | F2+ | LiteLLM supports it; deferred |
| Provider-specific fine-tuning endpoints | F3+ | LiteLLM supports `/fine_tuning`; not needed for F1 |
| Embeddings and image generation via LiteLLM | F2+ | LiteLLM supports both; F1 focuses on chat completions |
| OAuth2 for enterprise providers (private/regulated LLMs) | F2+ | Required for some enterprises; not blocking for F1 |
| LiteLLM virtual keys per tenant (gateway-level billing isolation) | F2+ | F1 uses OCTO budget governance layer |

---

## 15. Related ADRs

| ADR | Relationship |
|---|---|
| [ADR-F1-001](./ADR-F1-001-durable-execution-semantics.md) | LiteLLM calls persisted as `RunStep` with `estimated_cost_usd`; budget enforcement per I-8 requires pre-call evaluation |
| [ADR-F1-002](./ADR-F1-002-replay-semantics-and-determinism-rules.md) | Replay must use the same model resolution (hierarchy snapshot) as original execution; LiteLLM model strings must be deterministic |
| [ADR-F1-005](./ADR-F1-005-tenant-isolation-and-rls.md) | `tenant_id` propagated through LiteLLM metadata; circuit breaker state is tenant-isolated |
| [ADR-F1-007](./ADR-F1-007-tool-sandboxing-approval-policies-and-mcp.md) | Tool execution and LLM calls are distinct concerns; MCP tools resolved by ToolRegistry, LLM calls resolved by LLMProvider |

---

## 16. Exit Criteria Integration

For F1 to be declared **STABLE**, all of the following must pass in the integration test suite:

| Requirement | Test |
|---|---|
| No provider SDK imports outside adapter | Static analysis: `grep -r "import openai" apps/runtime-worker/app/ --exclude-dir=adapters` returns 0 matches |
| Token accounting per step | Integration: LLM call → `execution_steps.metadata_json` contains `input_tokens`, `output_tokens`, `estimated_cost_usd` |
| Circuit breaker opens after threshold | Integration: simulate 5 failures → circuit OPEN → next call fails fast (`CircuitOpenError`) |
| Circuit breaker recovers after timeout | Integration: OPEN circuit → wait 30s half-open → one success probe → circuit CLOSED |
| Budget pre-evaluation blocks call | Integration: budget exhausted mid-run → execution transitions to `PAUSED` or `FAILED` with `LLM_BUDGET_EXCEEDED` before LLM call dispatched |
| Model hierarchy resolution | Integration: agent overrides workspace model → `resolved_model` equals agent model; fallback chain works when primary unavailable |
| LiteLLM Proxy health check | Health endpoint returns `{"status": "ok"}`; runtime worker fails fast on startup if proxy unreachable |
| Provider-specific param drop logged | Unit: unknown param in `provider_params` → warning log emitted with `event=provider_param_dropped` |
| Token accounting failure non-blocking | Unit: mock usage=None from provider → execution result persisted; error metric incremented |

---

## References

- `F1.md §5 LiteLLM Integration`
- `OCTO-v5-arquitectura.md §Absolute Architectural Principles #7`
- `F0-005-semantic-kernel-sdk-contracts.md`
- [LiteLLM Proxy Docs](https://docs.litellm.ai/docs/proxy/quick_start)
- [CrewAI LiteLLM Integration](https://docs.crewai.com/concepts/llms)
- [LangGraph + LiteLLM Starter](https://github.com/CopilotKit/copilotkit-starter-langgraph-litellm)
- [AutoGen LiteLLM Proxy](https://microsoft.github.io/autogen/docs/topics/non-openai-models/local-litellm-ollama)
- [Thoughtworks Technology Radar: LiteLLM](https://www.thoughtworks.com/radar/languages-and-frameworks/litellm)
- [Microsoft AI Agents for Beginners: Production](https://microsoft.github.io/ai-agents-for-beginners/translations/es/10-ai-agents-production/)
- [Microsoft AI Agents for Beginners: Protocols](https://microsoft.github.io/ai-agents-for-beginners/translations/es/11-agentic-protocols/)
