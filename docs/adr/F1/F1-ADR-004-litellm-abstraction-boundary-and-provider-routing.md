# F1-ADR-004 — LiteLLM Abstraction Boundary and Provider Routing

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Phase** | F1 |
| **Author** | OCTO Architecture |
| **Created** | 2026-05-21 |
| **Enriched** | 2026-05-22 |
| **Supersedes** | ADR-F1-004 Proposed (2026-05-21) |
| **Closes** | [#97](https://github.com/lssmanager/OCTO/issues/97) |

---

## Context

OCTO must support multiple LLM providers (OpenAI, Anthropic, Google, Groq, local models via Ollama, etc.) without coupling the runtime core to any vendor SDK. Provider selection, fallback, rate limiting, token accounting, and timeout policy must be configurable per agent, per workspace, per department, and per agency in the hierarchy. Any vendor migration must be transparent to the runtime core.

The architecture mandate is explicit:

> **The runtime must never directly depend on vendor SDKs. All providers are abstracted behind adapters.**
> Architecture: `Runtime → Provider Abstraction Layer → LiteLLM → Providers`.

Three alternative models were evaluated before selecting LiteLLM as the single gateway:

| Model | Description | Rejection Reason |
|---|---|---|
| Direct vendor SDKs | Runtime core imports `openai`, `anthropic`, etc. directly | Violates provider abstraction mandate; vendor lock-in |
| Custom proxy without LiteLLM | Build in-house translation layer for 100+ providers | Duplicates LiteLLM's normalization work; unsustainable maintenance |
| LangChain model abstractions | Heavy dependency with opinionated model interface | Adds unnecessary weight; OCTO's runtime-worker must remain lean |

**Reference implementations analysed:** CrewAI (native SDKs + LiteLLM fallback), LangGraph (LiteLLM as model gateway), Semantic Kernel (AI service connector abstraction), Microsoft Agent Framework (provider-agnostic design), n8n (LiteLLM as unified gateway), AutoGen (LiteLLM proxy for non-OpenAI models), Paperclip (budget governance across providers).

---

## Decision

**OCTO F1 uses LiteLLM as the single gateway for all LLM provider calls, accessed exclusively through a `LLMProvider` interface defined in `packages/sdk-abstractions` (TS) and `app/contracts/llm.py` (Python).**

---

## 1. Boundary Definition

The boundary between the runtime core and the provider layer is a hard technical invariant — not a style preference.

```
runtime-worker (Python)
  └─ imports only from app.adapters.llm   ← exposes LLMProvider interface
       └─ LiteLLMAdapter                  ← concrete adapter, knows LiteLLM
            └─ LiteLLM Proxy              ← separate process, holds API keys
                 └─ Provider SDKs         ← OpenAI, Anthropic, Google, etc.
```

**No import of `openai`, `anthropic`, `google-generativeai`, or any provider SDK is allowed anywhere in `apps/runtime-worker/app/` outside of `app/adapters/` files.**

The Redis agent-memory-server issue #105 (upstream validation) illustrates the exact technical debt OCTO avoids: multiple wrapper classes (`OpenAIClientWrapper`, `AnthropicClientWrapper`, `BedrockClientWrapper`) with duplicated logic, manual provider detection strings, and high maintenance burden. LiteLLM solves this by:

- Handling provider detection automatically from model name prefix.
- Normalising responses across all providers to a single schema.
- Isolating provider API changes: when OpenAI or Anthropic update their APIs, LiteLLM absorbs the change; OCTO runtime code is untouched.
- Supporting new providers via new model string (e.g. `gemini/gemini-pro`, `command-r-plus`, `ollama/llama3`) with zero application code changes.

---

## 2. Interface Contract

Defined in `packages/sdk-abstractions/src/llm.ts` (TypeScript) and `app/contracts/llm.py` (Python). See `[F1-CTR-001]` for the generated JSON Schema. The runtime core calls only `provider.chat(request)` and `provider.stream(request)`.

### TypeScript

```typescript
// packages/sdk-abstractions/src/llm.ts

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
  model: string;                // LiteLLM format: provider/model-name
  temperature: number;
  maxOutputTokens: number;
  stream: boolean;
  timeoutMs: number;            // default 90000, max 300000
  messages: CanonicalChatMessage[];
  tools?: CanonicalToolDefinition[];
  providerParams?: Record<string, unknown>; // allowlisted provider-specific params
  metadata?: Record<string, string>;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  provider: string;
  model: string;
  estimatedCostUsd: string;     // Decimal string — never float
}

export interface ChatCompletionResponse {
  id: string;
  content: string;
  toolCalls?: Array<{ id: string; name: string; argumentsJson: string; }>;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error';
  usage: ChatUsage;
  raw: Record<string, unknown>; // full provider response, never logged to stdout
}

export interface LLMProvider {
  chat(req: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  stream(req: ChatCompletionRequest): AsyncIterable<Record<string, unknown>>;
}
```

### Python

```python
# app/contracts/llm.py  (generated from Zod — do not edit by hand)
from __future__ import annotations
from typing import Any, AsyncIterable, Literal
from decimal import Decimal
from abc import ABC, abstractmethod
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
    model: str                        # LiteLLM format: provider/model-name
    temperature: float = 0.2
    max_output_tokens: int = 2048
    stream: bool = False
    timeout_ms: int = 90_000          # max 300_000
    messages: list[CanonicalChatMessage]
    tools: list[CanonicalToolDefinition] | None = None
    provider_params: dict[str, Any] | None = None  # allowlisted provider-specific
    metadata: dict[str, str] | None = None


class ChatUsage(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int
    provider: str
    model: str
    estimated_cost_usd: Decimal       # Decimal — never float


class ChatCompletionResponse(BaseModel):
    id: str
    content: str
    tool_calls: list[dict[str, Any]] | None = None
    finish_reason: Literal["stop", "tool_calls", "length", "content_filter", "error"]
    usage: ChatUsage
    raw: dict[str, Any]               # full provider response, never logged


class LLMProvider(ABC):
    @abstractmethod
    async def chat(self, req: ChatCompletionRequest) -> ChatCompletionResponse: ...

    @abstractmethod
    async def stream(self, req: ChatCompletionRequest) -> AsyncIterable[dict[str, Any]]: ...
```

---

## 3. Provider Routing

Model resolution follows hierarchy precedence. The resolver reads the `context_snapshot_json` captured at execution start (ADR-F1-001 §I-8) — never live config — to guarantee deterministic replay.

```
1. agent.modelPolicy.primaryModel
2. → if absent: workspace.modelPolicy.primaryModel
3. → if absent: department.modelPolicy.primaryModel
4. → if absent: agency.modelPolicy.primaryModel
5. → if absent: global.defaultModel
```

The resolved model string **must** use LiteLLM format: `provider/model-name`.

| Example model string | Provider |
|---|---|
| `openai/gpt-4.1-mini` | OpenAI |
| `anthropic/claude-3-5-haiku` | Anthropic |
| `gemini/gemini-2.0-flash` | Google |
| `groq/llama-3.1-8b-instant` | Groq |
| `ollama/llama3` | Local Ollama |
| `command-r-plus` | Cohere |

**Fallback chain** is resolved using the same precedence. If the primary model fails after exhausting retries, the adapter tries each fallback model in order before escalating to terminal failure.

### Provider-specific parameters

Some models require provider-specific parameters (e.g. `reasoning_effort` for `o3`). These are passed through `provider_params` and validated against an allowlist per provider. Parameters not on the allowlist are dropped with a `WARN` log. A drop that affects a `required` capability emits an OTel counter `octo_llm_dropped_param_total{param, provider}` and a structured alert.

---

## 4. Timeout and Retry Policy

| Parameter | Default | Override | Max |
|---|---|---|---|
| Per-call timeout | 90 s | `agent.modelPolicy.timeoutMs` | 300 s |
| Retry attempts | 3 | `agent.modelPolicy.retryAttempts` | 5 |
| Backoff schedule | 2 s, 10 s, 30 s | fixed | — |
| Circuit breaker failure threshold | 5 failures / 60 s | global config | — |
| Circuit half-open probe after | 30 s | global config | — |

Retries apply for: `HTTP 429`, `HTTP 408`, `HTTP 5xx`.  
Retries do **not** apply for: `HTTP 400`, `HTTP 401`, `HTTP 403`, content filter, unsupported model.

**Circuit breaker Redis key pattern:**

```
octo:{tenant_id}:circuit:{provider}:{model}
```

State values: `CLOSED` (default/absent key), `OPEN` (with TTL = timeout_seconds), `HALF_OPEN` (with TTL = half_open_after).

---

## 5. Token Accounting

Every `ChatCompletionResponse.usage` **must** be persisted into `execution_steps.metadata_json` for every LLM call. This is non-negotiable.

Required fields:

```json
{
  "llm_call": {
    "provider": "openai",
    "model": "openai/gpt-4.1-mini",
    "input_tokens": 512,
    "output_tokens": 256,
    "total_tokens": 768,
    "estimated_cost_usd": "0.000384",
    "latency_ms": 1240,
    "retry_count": 0,
    "fallback_level": 0
  }
}
```

**Token accounting failure must not prevent execution result from being persisted.** If `usage` is missing or malformed, the step is persisted with `accounting_error: true` and a `WARN` log. A metric `octo_token_accounting_error_total{reason}` is emitted.

**Budget pre-evaluation (I-A6):** The runtime evaluates effective budget policy against cumulative spend **before** dispatching each LLM call. If the remaining budget does not cover `min_reserved_cost`, the execution transitions to `PAUSED` (awaiting budget override approval) or `FAILED` with `LLM_BUDGET_EXCEEDED`, according to the agent's `budgetPolicy.onExhaust` setting.

---

## 6. Tenant Isolation

LiteLLM `metadata` carries `tenant_id`, `execution_id`, and `agent_id` on every request:

```python
extra_headers={
    "x-tenant-id": req.tenant_id,
    "x-execution-id": req.execution_id,
    "x-agent-id": req.agent_id,
},
```

In F1, isolation is enforced at the OCTO budget governance layer. LiteLLM virtual keys per tenant are a F2+ feature for provider-level billing isolation.

---

## 7. LiteLLM Proxy Mode (Required)

OCTO **requires** LiteLLM Proxy mode (not embedded `litellm.completion()`). Runtime workers never hold provider API keys. Keys are managed at the Control Plane and injected into the LiteLLM Proxy container via environment variables.

### Proxy configuration (`infra/litellm/config.yaml`)

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
  - model_name: llama3-local
    litellm_params:
      model: ollama/llama3
      api_base: http://ollama:11434

litellm_settings:
  drop_params: true       # discard unsupported params; OCTO logs drops (see I-A7)
  set_verbose: false
  telemetry: false        # OCTO uses its own OTel pipeline

general_settings:
  master_key: ${LITELLM_MASTER_KEY}
  store_model_in_db: false
```

### LiteLLMAdapter (Python)

```python
# apps/runtime-worker/app/adapters/llm/litellm_adapter.py
import time
from openai import AsyncOpenAI  # OpenAI SDK used only as HTTP client — NOT as model SDK
from app.contracts.llm import (
    ChatCompletionRequest, ChatCompletionResponse, ChatUsage, LLMProvider
)
from app.adapters.llm.error_mapper import map_litellm_error
from app.adapters.llm.circuit_breaker import CircuitBreaker


class LiteLLMAdapter(LLMProvider):
    """
    Concrete adapter. The ONLY file in apps/runtime-worker/ that may
    import openai or make HTTP calls to the LiteLLM proxy.
    """

    def __init__(self, proxy_url: str, proxy_api_key: str, redis_client) -> None:
        self._client = AsyncOpenAI(
            base_url=f"{proxy_url}/v1",
            api_key=proxy_api_key,
            timeout=90.0,
            max_retries=0,      # OCTO's retry policy owns retries
        )
        self._redis = redis_client

    async def chat(self, req: ChatCompletionRequest) -> ChatCompletionResponse:
        provider, _ = req.model.split("/", 1)
        cb = CircuitBreaker(self._redis, req.tenant_id, provider, req.model)

        async def _call():
            start = time.monotonic()
            response = await self._client.chat.completions.create(
                model=req.model,
                messages=[m.model_dump(exclude_none=True) for m in req.messages],
                tools=self._to_tool_spec(req.tools) if req.tools else None,
                temperature=req.temperature,
                max_tokens=req.max_output_tokens,
                timeout=req.timeout_ms / 1000,
                extra_headers={
                    "x-tenant-id": req.tenant_id,
                    "x-execution-id": req.execution_id,
                    "x-agent-id": req.agent_id,
                },
                **(req.provider_params or {}),
            )
            return self._to_canonical(response, req.model, time.monotonic() - start)

        try:
            return await cb.call(_call)
        except Exception as exc:
            raise map_litellm_error(exc) from exc

    async def stream(self, req: ChatCompletionRequest):
        async with await self._client.chat.completions.create(
            model=req.model,
            messages=[m.model_dump(exclude_none=True) for m in req.messages],
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

    @staticmethod
    def _to_tool_spec(tools) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.input_schema,
                },
            }
            for t in tools
        ]

    @staticmethod
    def _to_canonical(response, model: str, latency_s: float) -> ChatCompletionResponse:
        choice = response.choices[0]
        usage = response.usage
        provider = model.split("/")[0] if "/" in model else "unknown"
        return ChatCompletionResponse(
            id=response.id,
            content=choice.message.content or "",
            tool_calls=[
                {
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments_json": tc.function.arguments,
                }
                for tc in (choice.message.tool_calls or [])
            ] or None,
            finish_reason=choice.finish_reason or "stop",
            usage=ChatUsage(
                input_tokens=usage.prompt_tokens,
                output_tokens=usage.completion_tokens,
                total_tokens=usage.total_tokens,
                provider=provider,
                model=model,
                estimated_cost_usd=str(
                    getattr(response, "_hidden_params", {}).get("response_cost", "0")
                ),
            ),
            raw=response.model_dump(),
        )
```

---

## 8. Circuit Breaker Implementation

```python
# apps/runtime-worker/app/adapters/llm/circuit_breaker.py
import asyncio
import time
from dataclasses import dataclass
from enum import Enum


class CircuitState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitOpenError(RuntimeError):
    """Raised when the circuit is OPEN and calls are rejected fast."""


@dataclass
class CircuitBreaker:
    redis_client: object
    tenant_id: str
    provider: str
    model: str
    failure_threshold: int = 5
    window_seconds: int = 60
    half_open_after: int = 30

    @property
    def _key(self) -> str:
        return f"octo:{self.tenant_id}:circuit:{self.provider}:{self.model}"

    @property
    def _fail_key(self) -> str:
        return f"{self._key}:failures"

    async def call(self, func, *args, **kwargs):
        state = await self._get_state()
        if state == CircuitState.OPEN:
            raise CircuitOpenError(f"Circuit OPEN: {self._key}")
        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except CircuitOpenError:
            raise
        except Exception as exc:
            await self._on_failure()
            raise exc

    async def _get_state(self) -> CircuitState:
        val = await self.redis_client.get(self._key)
        if val == b"OPEN":
            return CircuitState.OPEN
        if val == b"HALF_OPEN":
            return CircuitState.HALF_OPEN
        return CircuitState.CLOSED

    async def _on_success(self) -> None:
        await self.redis_client.delete(self._key, self._fail_key)

    async def _on_failure(self) -> None:
        count = await self.redis_client.incr(self._fail_key)
        await self.redis_client.expire(self._fail_key, self.window_seconds)
        if int(count) >= self.failure_threshold:
            await self.redis_client.setex(self._key, self.window_seconds, "OPEN")
            # Half-open probe scheduled after timeout
            asyncio.get_event_loop().call_later(
                self.half_open_after,
                lambda: asyncio.ensure_future(
                    self.redis_client.setex(self._key, self.half_open_after, "HALF_OPEN")
                ),
            )
```

---

## 9. Error Mapping Matrix

```python
# apps/runtime-worker/app/adapters/llm/error_mapper.py
from openai import (
    RateLimitError, APITimeoutError, APIStatusError,
    BadRequestError, AuthenticationError, PermissionDeniedError
)


class LLMCanonicalError(RuntimeError):
    def __init__(self, code: str, message: str, retryable: bool):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


def map_litellm_error(exc: Exception) -> LLMCanonicalError:
    if isinstance(exc, RateLimitError):
        return LLMCanonicalError("LLM_RATE_LIMITED", str(exc), retryable=True)
    if isinstance(exc, APITimeoutError):
        return LLMCanonicalError("LLM_TIMEOUT", str(exc), retryable=True)
    if isinstance(exc, AuthenticationError):
        return LLMCanonicalError("LLM_PROVIDER_AUTH_FAILED", str(exc), retryable=False)
    if isinstance(exc, PermissionDeniedError):
        return LLMCanonicalError("LLM_MODEL_NOT_ALLOWED", str(exc), retryable=False)
    if isinstance(exc, BadRequestError):
        return LLMCanonicalError("LLM_BAD_REQUEST", str(exc), retryable=False)
    if isinstance(exc, APIStatusError):
        if exc.status_code >= 500:
            return LLMCanonicalError("LLM_PROVIDER_UNAVAILABLE", str(exc), retryable=True)
        return LLMCanonicalError("LLM_BAD_REQUEST", str(exc), retryable=False)
    return LLMCanonicalError("LLM_UNKNOWN_ERROR", str(exc), retryable=False)
```

| LiteLLM / Provider condition | Canonical code | Retryable | State effect |
|---|---|---|---|
| HTTP 429 | `LLM_RATE_LIMITED` | ✓ | retry / fallback |
| HTTP 408 / timeout | `LLM_TIMEOUT` | ✓ | retry |
| HTTP 5xx | `LLM_PROVIDER_UNAVAILABLE` | ✓ | retry / fallback |
| Malformed payload | `LLM_BAD_REQUEST` | ✗ | FAILED |
| Unsupported model | `LLM_MODEL_NOT_ALLOWED` | ✗ | FAILED |
| Content filter | `LLM_CONTENT_FILTERED` | ✗ | FAILED or redacted output |
| Auth failure | `LLM_PROVIDER_AUTH_FAILED` | ✗ | FAILED + ops alert |
| Invalid tool call JSON | `LLM_TOOL_CALL_INVALID` | ✓ once | re-prompt then FAILED |
| Empty response | `LLM_EMPTY_RESPONSE` | ✓ once | retry |
| Budget exhausted | `LLM_BUDGET_EXCEEDED` | ✗ | PAUSED or FAILED |
| Circuit open | `LLM_CIRCUIT_OPEN` | ✗ | FAILED fast |

---

## 10. Observability

Every LLM call must emit the following OTel attributes and Prometheus metrics.

### OTel span attributes (`llm.call`)

```
tenant_id, execution_id, agent_id, provider, model,
latency_ms, input_tokens, output_tokens, retry_count,
fallback_level, circuit_state, http_status, finish_reason
```

### Prometheus metrics

```
octo_litellm_request_total{provider, model, status}       counter
octo_litellm_latency_seconds_bucket{provider, model}      histogram
octo_litellm_tokens_input_total{provider, model}          counter
octo_litellm_tokens_output_total{provider, model}         counter
octo_litellm_cost_usd_total{provider, model, tenant_id}   counter
octo_litellm_circuit_state{provider, model, tenant_id}    gauge  (0=CLOSED 1=OPEN 2=HALF_OPEN)
octo_litellm_fallback_total{from_model, to_model}         counter
octo_token_accounting_error_total{reason}                 counter
octo_llm_dropped_param_total{param, provider}             counter
octo_llm_budget_exceeded_total{tenant_id}                 counter
```

---

## 11. Cross-Framework Validation

### CrewAI
CrewAI routes via model string prefix (e.g. `ollama/`, `groq/`) to LiteLLM, and uses native SDKs for `openai/`, `anthropic/`, `gemini/`. OCTO diverges intentionally: LiteLLM is the **only** path for all providers, because runtime workers must never hold or use provider SDKs. This is a deliberate architectural trade-off — fewer native optimisations in exchange for a single, auditable, replaceable gateway.

### LangGraph
LangGraph configures LiteLLM as the model gateway in `copilotkit-starter-langgraph-litellm`, validating that `provider/model` strings work transparently through the adapter without the runtime knowing the provider.

### Semantic Kernel
Semantic Kernel's `IChatCompletion` abstraction confirms the pattern. SK still requires provider-specific `PromptExecutionSettings`; OCTO pushes all provider specifics into the adapter's `provider_params` allowlist instead.

### Microsoft Agent Framework
MAF is explicitly provider-independent and includes durability (pause/resume/recovery). This confirms that provider abstraction and durable execution (ADR-F1-001) are complementary, not competing.

### n8n + LLemonStack
Production deployment of n8n proxies all LLM requests through LiteLLM with Langfuse observability, confirming LiteLLM as a production-tested choice for multi-provider agent stacks.

### AutoGen
AutoGen uses LiteLLM Proxy to make local Ollama and other non-OpenAI providers appear as OpenAI endpoints. Directly validates OCTO's Proxy-first approach.

### Paperclip
Paperclip enforces budget governance per model call with hard stops by level. OCTO's per-step `estimated_cost_usd` and budget pre-evaluation invariant (I-A6) are directly derived from this pattern.

### Microsoft AI Agents for Beginners
Observability is required for agents to become "glass boxes" (not black boxes). OCTO's mandatory `trace_id + execution_id + agent_id + tenant_id` on every LLM call satisfies this requirement. Cost management via per-step token tracking is the operational foundation for this visibility.

---

## 12. Invariants

| ID | Invariant | Enforcement |
|---|---|---|
| **I-A1** | No `import openai`, `import anthropic`, or any provider SDK in `apps/runtime-worker/app/` outside `app/adapters/`. | Static analysis in CI: `grep -r "import openai" apps/runtime-worker/app/ --exclude-dir=adapters` |
| **I-A2** | No direct HTTP call to `api.openai.com`, `api.anthropic.com`, or similar from the runtime core. | Code review + network egress policy on runtime-worker container |
| **I-A3** | All model strings persisted in execution rows use LiteLLM `provider/model` format. | Zod/Pydantic schema validation with regex `/^[a-z][a-z0-9_-]+\/[a-z0-9._-]+$/` |
| **I-A4** | Token accounting failure must not prevent execution result from being persisted. | Unit test: mock `usage=None`, verify step persists with `accounting_error=true` |
| **I-A5** | Circuit breaker state is per `tenant_id:provider:model`, stored in Redis. | Integration test: 5 failures → key exists with `OPEN` value |
| **I-A6** | Budget pre-evaluation occurs before each LLM call, using `budget_snapshot_json`. | Integration test: exhaust budget → verify call is not dispatched |
| **I-A7** | Provider-specific parameters in `provider_params` are validated against an allowlist. Unlisted params are dropped with a `WARN` log and `octo_llm_dropped_param_total` metric. | Unit test: unknown param → dropped; known required param allowed |

---

## 13. Consequences

### Positive

| Consequence | Validation source |
|---|---|
| Provider migration requires only adapter change, not runtime change | Redis agent-memory-server upstream example |
| LiteLLM handles provider-specific payload normalisation, retry, and error mapping | Thoughtworks Technology Radar on LiteLLM |
| Token accounting centralised and auditable | MAF + Paperclip governance model |
| Testability: runtime tests mock `LLMProvider`, not provider HTTP | Semantic Kernel `IChatCompletion` pattern |
| Unified governance: rate limiting, circuit breakers, budget at one layer | Thoughtworks on LiteLLM cross-cutting concerns |

### Negative and Mitigations

| Negative | Mitigation |
|---|---|
| LiteLLM is an additional process to operate | Containerised with health check; battle-tested in LLemonStack production |
| LiteLLM bugs or breaking changes affect all providers | Version pinning (exact), staging validation before upgrade |
| Provider-specific features may require adapter extension | `provider_params` with allowlist validation (I-A7) |
| `drop_params` may silently discard unsupported parameters | Log drops; alert if `required` capability is dropped |
| Supply-chain risk (LiteLLM PyPI history) | Pin exact version, verify checksums, SBOM (CycloneDX), Trivy scan |

---

## 14. Non-Goals (F1)

| Feature | Deferred to | Rationale |
|---|---|---|
| Multi-provider active-active load balancing | F2+ | LiteLLM supports it; F1 uses primary → fallback chain |
| Distributed tracing across LiteLLM and runtime (Langfuse) | F2+ | LiteLLM supports Langfuse/OTel integration; integration deferred |
| Provider-specific fine-tuning endpoints | F3+ | Not needed for F1 chat execution |
| Embeddings and image generation via LiteLLM | F2+ | F1 focuses on chat completions |
| OAuth2 for enterprise on-premise providers | F2+ | LiteLLM supports custom auth handlers; not blocking F1 |
| LiteLLM virtual keys per tenant | F2+ | F1 isolation is at OCTO budget governance layer |

---

## 15. Exit Criteria for F1 STABLE

| Requirement | Test |
|---|---|
| No provider SDK imports outside adapter | `grep -r "import openai" apps/runtime-worker/app/ --exclude-dir=adapters` exits non-zero |
| Token accounting persisted per step | Integration: LLM call → `execution_steps.metadata_json` contains `input_tokens`, `output_tokens`, `estimated_cost_usd` |
| Circuit breaker opens after 5 failures | Integration: 5 simulated 5xx → Redis key `OPEN` |
| Circuit breaker recovers after 30 s probe | Integration: 30 s elapsed → probe succeeds → key deleted |
| Budget pre-evaluation blocks LLM call | Integration: exhausted budget → `PAUSED` or `FAILED(LLM_BUDGET_EXCEEDED)` before HTTP call dispatched |
| Model hierarchy resolution | Integration: agent overrides workspace model → adapter receives agent model; fallback chain works |
| LiteLLM Proxy health check | Runtime worker fails to start if proxy unreachable; health endpoint `/health` returns `200` |
| Error mapping correctness | Unit: each error class → correct canonical code and `retryable` flag |
| `provider_params` allowlist enforced | Unit: unknown param dropped with `WARN`; required param allowed through |

---

## 16. Related ADRs

| ADR | Relationship |
|---|---|
| [ADR-F1-001 — Durable Execution Semantics](./F1-ADR-001-durable-execution-semantics.md) | LiteLLM calls are persisted as `execution_steps` with `estimated_cost_usd`; budget enforcement (I-A6) requires pre-call evaluation per I-8 |
| [ADR-F1-002 — Replay Semantics and Determinism Rules](../F1-ADR-002-replay-semantics-and-determinism-rules.md) | Replay must use the `context_snapshot_json` model resolution; LiteLLM model strings must be deterministic and stored verbatim |
| [ADR-F1-005 — Tenant Isolation and RLS](./F1-ADR-005-tenant-isolation-rls.md) | `tenant_id` propagated through LiteLLM metadata; circuit breaker key is tenant-scoped |

---

## 17. References

- `F1.md §5 LiteLLM Integration`
- `OCTO-v5-arquitectura.md §Absolute Architectural Principles #7`
- `F0-005-semantic-kernel-sdk-contracts.md`
- [LiteLLM Proxy documentation](https://docs.litellm.ai/docs/proxy/quick_start)
- [Thoughtworks Technology Radar — LiteLLM](https://www.thoughtworks.com/radar/tools/litellm)
- [CrewAI — Connecting to LLMs](https://docs.crewai.com/concepts/llms)
- [LangGraph + LiteLLM starter](https://github.com/CopilotKit/copilotkit-starter-langgraph-litellm)
- [Microsoft AI Agents for Beginners — Production](https://microsoft.github.io/ai-agents-for-beginners/translations/es/10-ai-agents-production/)
- [Microsoft AI Agents for Beginners — Agentic Protocols](https://microsoft.github.io/ai-agents-for-beginners/translations/es/11-agentic-protocols/)


## 2026-05 hardening addendum
- Budget `pause_for_approval` integrates with durable approvals workflow in runtime-worker.
- Provider health metrics are collected by periodic worker and materialized into tenant-scoped Redis snapshots (`octo:{tenant_id}:provider_health:{provider}:{model}`).
- Routing decisions and fallback metadata must be persisted per step for auditability.
- Semantic cache remains deferred for F2 when Qdrant production backend is fully enabled; F1 may use disabled/guarded mode only.
