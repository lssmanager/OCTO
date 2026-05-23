# ADR-F1-007 — Tool Sandboxing y MCP Compatibility

**Status:** Accepted  
**Phase:** F1 — Core Runtime & Real Agent Execution  
**Author:** OCTO Architecture  
**Date:** 2026-05-22  
**Issue:** [#100](https://github.com/lssmanager/OCTO/issues/100)  
**Supersedes:** ADR-F1-007 Proposed  

---

## Table of Contents

1. [Context](#1-context)
2. [Decision](#2-decision)
3. [Threat Model](#3-threat-model)
4. [Tool Trust Boundary](#4-tool-trust-boundary)
5. [Tool Registry](#5-tool-registry)
6. [Policy and Authorization Model](#6-policy-and-authorization-model)
7. [Execution Lifecycle](#7-execution-lifecycle)
8. [Sandboxing by ToolKind](#8-sandboxing-by-toolkind)
9. [MCP Compatibility Contract](#9-mcp-compatibility-contract)
10. [Approval Policies and HITL](#10-approval-policies-and-hitl)
11. [Retry, Idempotency and Replay](#11-retry-idempotency-and-replay)
12. [Schema Validation](#12-schema-validation)
13. [Compensation Model](#13-compensation-model)
14. [Persistence Model](#14-persistence-model)
15. [Implementation Blueprint](#15-implementation-blueprint)
16. [Security Hardening Requirements](#16-security-hardening-requirements)
17. [Observability and Audit Trail](#17-observability-and-audit-trail)
18. [Failure and Recovery Model](#18-failure-and-recovery-model)
19. [Invariants](#19-invariants)
20. [Alternatives Rejected](#20-alternatives-rejected)
21. [Consequences](#21-consequences)
22. [Cross-Framework Validation](#22-cross-framework-validation)
23. [Validation Test Suite](#23-validation-test-suite)
24. [Operational Runbook](#24-operational-runbook)
25. [Exit Criteria Integration](#25-exit-criteria-integration)
26. [Related ADRs](#26-related-adrs)
27. [References](#27-references)

---

## 1. Context

OCTO F1 executes real tools invoked by language models. A tool call is not a harmless text completion: it may write to a database, call a third-party API, read files, create tickets, send email, mutate infrastructure, execute code, invoke browser automation, or coordinate with external MCP servers.

The tool call originates from nondeterministic model output. The model may be influenced by direct prompts, indirect prompt injection, malicious retrieved content, compromised tool descriptions, poisoned MCP metadata, or stale context. Therefore, the runtime must treat every tool request as untrusted input, even when the surrounding execution is authenticated.

F1 also introduces MCP compatibility. MCP is the ecosystem standard for exposing tools, resources and prompts to agentic clients, but OCTO cannot let MCP become a parallel execution plane. MCP must be a source of tool definitions and a transport adapter, not a way to bypass the OCTO `ToolRegistry`, `PolicyEngine`, sandboxing, approval gates, audit trail, idempotency and checkpointing.

This ADR materializes the F1 rule already defined in the runtime plan:

```text
LLM output is untrusted.
Tool metadata is untrusted until registered and approved.
Tool arguments are untrusted until schema-validated.
Tool output is untrusted until schema-validated and sanitized.
MCP is a protocol adapter, not a privileged execution path.
```

OCTO already defines in the product architecture that MCP is the official extensibility surface for external tools, and that `ToolRegistry`, `ToolGuard`, permissions, retries, approval hooks and observability must apply uniformly to every tool. F1 turns that doctrine into an executable contract.

---

## 2. Decision

OCTO F1 implements a **secure tool execution subsystem** with these mandatory decisions:

| Decision | Requirement |
|---|---|
| Explicit registry | No tool executes unless present in `ToolRegistry`. |
| Allowlist execution | The model cannot invoke arbitrary names, binaries, URLs or MCP tools. |
| Schema-first | Input and output are validated against JSON Schema before execution and before model reinjection. |
| Sandbox by default | Builtin tools and MCP stdio servers run outside the main runtime process. |
| MCP as adapter | MCP imports tool definitions and invokes `tools/call`, but all execution still flows through OCTO `ToolExecutor`. |
| Approval gates | High-risk tools pause the execution durably and require human approval. |
| Idempotency | Retry is automatic only for safe or idempotent tools. |
| Durable replay | Tool results that affect deterministic replay are persisted in `tool_invocations` and checkpoint writes. |
| Audit and observability | Every invocation has trace IDs, tenant IDs, timing, status, schema validation result and sanitized arguments. |
| Compensation metadata | High-side-effect tools declare a compensation action or explicitly mark themselves non-compensatable. |

The canonical runtime path is:

```text
LLM tool_call
  -> ToolRegistry.resolve(name)
  -> JSON Schema input validation
  -> PolicyEngine.authorize(tenant, agent, role, scopes, sideEffectLevel)
  -> approval gate if required
  -> ToolInvocation row(status=PENDING)
  -> sandboxed execution
  -> JSON Schema output validation
  -> ToolInvocation row(status=SUCCEEDED|FAILED|TIMED_OUT)
  -> checkpoint write
  -> outbox events
  -> tool_result injected into next LLM call
```

A tool failure is not automatically a run failure. The runtime injects a structured tool error into the conversation unless policy marks the failure as terminal.

---

## 3. Threat Model

### 3.1 Primary Risks

| Risk | Description | OCTO Control |
|---|---|---|
| Prompt injection | User, web, file or RAG content instructs the model to call dangerous tools. | Allowlist, schema validation, policy engine, HITL for high-risk actions. |
| Tool poisoning | Tool metadata contains hidden instructions or misleading descriptions. | Registry approval, descriptor hashing, metadata scanning, operator review. |
| Tool shadowing | A malicious MCP server exposes a lookalike tool name or changes a tool after approval. | Stable registry IDs, descriptor hash pinning, `tools/list_changed` review gate. |
| Data exfiltration | Tool is tricked into reading and transmitting secrets or tenant data. | Tenant scope, no global secrets in env, egress policy, output sanitizer, audit trail. |
| Privilege escalation | MCP stdio or builtin tool executes host commands or uses Docker socket. | Subprocess isolation, container profile, no privileged mode, no Docker socket mount. |
| SSRF | MCP HTTP metadata or endpoints target internal networks or cloud metadata services. | URL allowlist, egress proxy, block private IP ranges, no automatic redirects to internal IPs. |
| Replay side effects | Reclaim/replay re-executes a non-idempotent tool. | Idempotency keys, persisted results, retry restrictions, compensation metadata. |
| Long-running hang | Tool never returns and blocks runtime worker. | Hard timeout, subprocess kill, async durable wait, lease-aware cancellation. |
| Output poisoning | Tool result injects instructions back into the LLM context. | Output schema validation, sanitizer, role tagging, structured error envelope. |

### 3.2 Attacker Assumptions

OCTO assumes:

- The model can be manipulated.
- Tool arguments can be malicious.
- Tool outputs can be malicious.
- MCP servers can be untrusted or compromised.
- A tool dependency can be vulnerable.
- A runtime worker can crash mid-step.
- Redis can redeliver commands or events.
- A user may attempt cross-tenant access.
- A legitimate tenant admin may accidentally install a risky tool.

The design goal is not perfect prevention. The design goal is containment, least privilege, auditability, deterministic recovery and operator control.

---

## 4. Tool Trust Boundary

A tool execution crosses multiple trust boundaries.

```text
LLM output
  -> OCTO parser boundary
  -> ToolRegistry boundary
  -> PolicyEngine boundary
  -> Approval boundary
  -> Sandbox boundary
  -> External system boundary
  -> Output validation boundary
  -> Checkpoint/replay boundary
  -> LLM reinjection boundary
```

The runtime must never collapse these boundaries for convenience.

### 4.1 Untrusted Inputs

The following are untrusted until validated:

- tool name from the model,
- JSON arguments emitted by the model,
- MCP `tools/list` metadata,
- MCP tool annotations,
- MCP server command configuration,
- MCP HTTP endpoint metadata,
- tool stdout and stderr,
- tool returned JSON,
- file paths returned by tools,
- URLs returned by tools,
- prompts/resources returned by MCP servers.

### 4.2 Trusted Sources

A tool becomes trusted for execution only when:

1. It is registered in `ToolRegistry`.
2. Its descriptor hash matches the approved descriptor.
3. Its input/output schemas compile.
4. Its side-effect level is declared.
5. Its tenant and agent binding are valid.
6. Its sandbox profile is configured.
7. Its approval policy is resolved.
8. Its network and secret policies are explicit.

---

## 5. Tool Registry

### 5.1 Canonical Contract

```typescript
export type ToolKind =
  | 'builtin_sync'
  | 'builtin_async'
  | 'mcp_stdio'
  | 'mcp_http';

export type SideEffectLevel = 'none' | 'low' | 'high';

export type ApprovalPolicy =
  | 'never_require'
  | 'always_require'
  | 'policy_based';

export interface ToolDefinition {
  name: string;
  kind: ToolKind;
  description: string;

  inputSchema: Record<string, unknown>;   // JSON Schema draft-07
  outputSchema: Record<string, unknown>;  // JSON Schema draft-07

  timeoutMs: number;
  retryable: boolean;
  sideEffectLevel: SideEffectLevel;
  approvalPolicy: ApprovalPolicy;
  requiresApproval: boolean;              // resolved effective value

  tenantScoped: boolean;
  allowedRoles: string[];
  allowedScopes: string[];

  sandboxProfile: string;                 // e.g. builtin-default, mcp-stdio-default, high-risk-container
  networkPolicy: 'none' | 'egress_allowlist' | 'mcp_http_only';
  egressAllowlist?: string[];

  compensationAction?: string;
  nonCompensatable?: boolean;

  source: 'builtin' | 'mcp' | 'hub' | 'custom';
  sourceRef?: string;                     // mcp_server_id, package id, hub id
  descriptorHash: string;                 // sha256 canonical descriptor
  version: number;
  enabled: boolean;
}
```

### 5.2 Naming Rules

| Rule | Requirement |
|---|---|
| Stable canonical name | `tool.name` is stable across versions. |
| Namespaced imported names | MCP tools are imported as `mcp.<server_slug>.<tool_name>` unless explicitly aliased. |
| No shadowing | A tool cannot reuse a name already bound in the same tenant unless an operator explicitly replaces it. |
| No free-form commands | A tool name never maps directly to a shell command, URL or module path from model output. |
| Descriptor hash | Any change to name, description, schema, annotations, server command or endpoint changes the hash and requires re-approval. |

### 5.3 Registration States

```text
DISCOVERED
  -> PENDING_REVIEW
  -> APPROVED
  -> ENABLED
  -> DISABLED
  -> DEPRECATED
  -> REVOKED
```

MCP discovery may create `DISCOVERED` or `PENDING_REVIEW` entries, but F1 does not execute discovered tools automatically. Execution requires `ENABLED`.

### 5.4 Tool Descriptor Review

Operator review must display:

- tool name and title,
- description,
- input schema,
- output schema,
- side-effect level,
- source server and transport,
- command or endpoint used to start/call the server,
- network egress policy,
- secrets requested,
- roles/scopes allowed,
- approval policy,
- descriptor hash.

Hidden text and instruction-like phrases in descriptions should be flagged for review. In F1 this is a deterministic heuristic plus optional LLM-based review; automatic semantic attestation is deferred.

---

## 6. Policy and Authorization Model

### 6.1 Authorization Inputs

The `PolicyEngine` evaluates:

```typescript
export interface ToolAuthorizationContext {
  tenantId: string;
  userId?: string;
  serviceId?: string;
  agentId: string;
  executionId: string;
  stepIndex: number;
  roles: string[];
  scopes: string[];
  tool: ToolDefinition;
  argumentsJson: Record<string, unknown>;
  effectiveAgentPolicy: Record<string, unknown>;
  traceId: string;
}
```

### 6.2 Decision Output

```typescript
export type ToolPolicyDecision =
  | {
      outcome: 'allow';
      requiresApproval: false;
      reason: string;
    }
  | {
      outcome: 'approval_required';
      requiresApproval: true;
      approvalReason: string;
      timeoutMs: number;
    }
  | {
      outcome: 'deny';
      code: 'TOOL_NOT_ALLOWED' | 'TOOL_SCOPE_DENIED' | 'TOOL_TENANT_DENIED' | 'TOOL_POLICY_DENIED';
      reason: string;
    };
```

### 6.3 Enforcement Rules

- If tool not found: return `TOOL_NOT_ALLOWED`.
- If tool disabled: return `TOOL_NOT_ALLOWED`.
- If descriptor hash mismatch: return `TOOL_DESCRIPTOR_CHANGED`.
- If role/scope insufficient: return `TOOL_SCOPE_DENIED`.
- If `tenantScoped=true`, tenant context must match active execution tenant.
- If `sideEffectLevel='high'`, approval is required unless a tenant policy explicitly grants a narrower exception.
- If approval is required, the execution transitions to `PAUSED`, not `FAILED`.
- If denied, inject a structured tool error and continue unless policy says terminal.

### 6.4 Structured Denial Injection

```json
{
  "type": "tool_result",
  "tool_name": "dangerous_tool",
  "status": "failed",
  "error_code": "TOOL_NOT_ALLOWED",
  "message": "The requested tool is not registered or not authorized for this agent.",
  "retryable": false
}
```

The model sees the error as a tool result and can replan.

---

## 7. Execution Lifecycle

### 7.1 State Machine

```text
MODEL_TOOL_CALL_DETECTED
  -> TOOL_NAME_RESOLVED
  -> TOOL_INPUT_SCHEMA_VALIDATED
  -> TOOL_AUTHORIZED
  -> TOOL_APPROVAL_REQUESTED?      (if required)
  -> TOOL_INVOCATION_CREATED
  -> TOOL_EXECUTING
  -> TOOL_OUTPUT_SCHEMA_VALIDATED
  -> TOOL_INVOCATION_FINALIZED
  -> TOOL_CHECKPOINTED
  -> TOOL_EVENTS_PUBLISHED
  -> TOOL_RESULT_INJECTED
```

### 7.2 Durable Step Mapping

| Lifecycle state | Durable write |
|---|---|
| Detected | `execution_steps(step_type='TOOL_CALL_DETECTED')` |
| Validated | `tool_invocations(status='VALIDATED')` |
| Authorized | `tool_invocations(policy_decision='allow')` |
| Approval requested | `approvals(status='PENDING')`, execution `PAUSED`, checkpoint write `idx=-3` |
| Executing | `tool_invocations(status='RUNNING', started_at=now())` |
| Result validated | `tool_invocations(result_schema_valid=true)` |
| Finalized | `tool_invocations(status='SUCCEEDED'|'FAILED'|'TIMED_OUT')` |
| Checkpointed | `execution_checkpoint_writes(type='tool_result')` |
| Events | `outbox_events(ToolInvocationStarted|ToolInvocationCompleted|ToolInvocationFailed)` |

### 7.3 Non-Terminal Tool Failures

The following tool failures do not automatically fail the execution:

- `TOOL_NOT_ALLOWED`
- `TOOL_INPUT_INVALID`
- `TOOL_OUTPUT_INVALID`
- `TOOL_TIMEOUT`
- `TOOL_EXECUTION_ERROR`
- `MCP_SERVER_UNAVAILABLE`
- `MCP_TOOL_ERROR`

The runtime injects a structured result and lets the model replan. A policy may mark specific errors terminal for specific tools.

---

## 8. Sandboxing by ToolKind

### 8.1 `builtin_sync`

`builtin_sync` tools execute inside the current step and must return before the next LLM call.

Execution requirements:

- subprocess isolated from runtime worker process,
- minimal environment,
- explicit working directory,
- no inherited `DATABASE_URL`,
- no global provider secrets,
- no Docker socket,
- timeout enforced by parent,
- stdout/stderr size limits,
- structured JSON output,
- output schema validation.

```python
async def execute_builtin_tool(
    tool_def: ToolDefinition,
    args: dict,
    tenant_id: str,
    execution_id: str,
    timeout_ms: int,
) -> ToolExecutionResult:
    workdir = create_tool_workdir(tenant_id, execution_id, tool_def.name)
    env = build_minimal_tool_env(
        tenant_id=tenant_id,
        execution_id=execution_id,
        trace_id=current_trace_id(),
        allowlist=tool_def.env_allowlist,
    )

    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        f"octo_tools.{tool_def.name}",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=workdir,
        env=env,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(canonical_json(args).encode("utf-8")),
            timeout=timeout_ms / 1000,
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return ToolExecutionResult(
            status="timed_out",
            errorCode="TOOL_TIMEOUT",
            errorMessage=f"Tool {tool_def.name} exceeded {timeout_ms}ms",
            durationMs=elapsed_ms(),
        )

    return parse_tool_process_result(
        return_code=proc.returncode,
        stdout=stdout,
        stderr=stderr,
        output_schema=tool_def.outputSchema,
    )
```

### 8.2 `builtin_async`

`builtin_async` tools return durable pending state instead of blocking worker memory.

```text
runtime-worker
  -> insert tool_invocations(status=PENDING_ASYNC)
  -> enqueue tool.async.result command or external callback registration
  -> checkpoint wait state
  -> either PAUSED or continue according to tool policy
  -> tool.async.result wakes execution through BullMQ command
```

Rules:

- No async tool waits in memory.
- Async callback must include `tenant_id`, `execution_id`, `tool_invocation_id`, `trace_id`.
- Callback is accepted only if idempotency key and status are valid.
- Duplicate callback returns the previously persisted result.

### 8.3 `mcp_stdio`

MCP stdio servers run as ephemeral child processes:

```text
spawn -> initialize -> tools/list verification -> tools/call -> validate -> terminate
```

F1 default is short-lived execution per invocation. F2 may introduce pooled stdio servers only if the same sandbox controls remain enforceable.

Requirements:

- server command must be operator-approved and descriptor-hashed,
- exact command and arguments must be visible in review UI,
- no dynamic command construction from LLM output,
- no inherited global secrets,
- no filesystem outside workdir unless explicitly granted,
- process killed on timeout,
- stdout/stderr capped,
- JSON-RPC messages validated,
- `tools/list` result must match registered descriptor hash before `tools/call`.

```python
async def execute_mcp_stdio_tool(
    tool_def: ToolDefinition,
    args: dict,
    context: ToolRuntimeContext,
) -> ToolExecutionResult:
    server = await spawn_mcp_server(
        command=tool_def.serverCommand,
        env=build_minimal_mcp_env(context, tool_def),
        cwd=context.workdir,
        timeout_ms=tool_def.timeoutMs,
    )

    try:
        await server.request("initialize", build_initialize_params(context))
        tools = await server.request("tools/list", {})
        verify_registered_descriptor(tool_def, tools)

        response = await asyncio.wait_for(
            server.request("tools/call", {
                "name": tool_def.remoteToolName,
                "arguments": args,
            }),
            timeout=tool_def.timeoutMs / 1000,
        )

        return normalize_mcp_result(response, tool_def.outputSchema)

    finally:
        await server.terminate()
```

### 8.4 `mcp_http`

MCP HTTP servers are called through an OCTO-controlled client adapter.

Requirements:

- HTTPS in production,
- endpoint allowlisted,
- private IP ranges and metadata endpoints blocked unless explicitly allowed for local development,
- no automatic redirect to internal targets,
- OAuth token audience bound to MCP server,
- no user/provider secrets forwarded as raw headers,
- `X-Tenant-ID`, `X-Execution-ID`, `X-Trace-ID` for observability only, not authorization,
- response size limit,
- timeout per call.

```python
async def execute_mcp_http_tool(
    tool_def: ToolDefinition,
    args: dict,
    context: ToolRuntimeContext,
) -> ToolExecutionResult:
    validate_endpoint_against_egress_policy(tool_def.endpoint, tool_def.egressAllowlist)

    headers = {
        "Authorization": f"Bearer {await get_mcp_access_token(tool_def.sourceRef)}",
        "X-Tenant-ID": context.tenant_id,
        "X-Execution-ID": context.execution_id,
        "X-Trace-ID": context.trace_id,
    }

    response = await http.post_json(
        url=tool_def.endpoint,
        json={
            "jsonrpc": "2.0",
            "id": context.request_id,
            "method": "tools/call",
            "params": {
                "name": tool_def.remoteToolName,
                "arguments": args,
            },
        },
        headers=headers,
        timeout_ms=tool_def.timeoutMs,
        max_bytes=tool_def.maxOutputBytes,
    )

    return normalize_mcp_result(response, tool_def.outputSchema)
```

### 8.5 High-Risk Container Profile

Tools with `sideEffectLevel='high'`, code execution, browser automation, infrastructure mutation or broad network access must use a hardened container profile rather than only a subprocess.

Minimum profile:

```yaml
security_opt:
  - no-new-privileges:true
read_only: true
cap_drop:
  - ALL
pids_limit: 128
mem_limit: 512m
cpus: 0.5
network_mode: none # unless egress_allowlist proxy is required
tmpfs:
  - /tmp:rw,noexec,nosuid,size=64m
volumes: []
```

If the tool needs network, it must go through an egress proxy or service mesh policy that blocks metadata endpoints, private IP ranges and unknown domains.

---

## 9. MCP Compatibility Contract

### 9.1 MCP Role in OCTO

MCP is accepted as:

- a discovery mechanism (`tools/list`),
- an invocation transport (`tools/call`),
- a standardized schema source,
- an integration surface for external tools.

MCP is not accepted as:

- a separate policy engine,
- a direct model-to-tool bridge,
- a permission bypass,
- a dynamic tool execution authority,
- a place to store OCTO runtime state,
- a substitute for durable `tool_invocations`.

### 9.2 Import Flow

```text
MCP server configured in Settings
  -> OCTO probes server
  -> initialize
  -> tools/list
  -> normalize descriptors
  -> compute descriptor hash
  -> create PENDING_REVIEW ToolDefinition records
  -> operator assigns sideEffectLevel, approvalPolicy, roles/scopes, sandboxProfile
  -> tool becomes ENABLED
```

### 9.3 Invocation Flow

```text
LLM emits tool call mcp.github.create_issue
  -> OCTO resolves local ToolDefinition
  -> policy + approval + idempotency
  -> MCP adapter calls remote tools/call
  -> result normalized into ToolExecutionResult
  -> same audit trail and checkpoint as builtin tool
```

### 9.4 Dynamic Tool Changes

If MCP server emits `notifications/tools/list_changed`:

1. OCTO re-fetches `tools/list`.
2. OCTO computes new descriptor hashes.
3. Existing enabled tools remain pinned to old descriptor until operator approval.
4. New or changed tools are `PENDING_REVIEW`.
5. Removed tools become `DEPRECATED` but not deleted.
6. Executions already in progress continue only if descriptor hash matches their context snapshot.

### 9.5 Descriptor Integrity

```typescript
export interface McpImportedDescriptor {
  serverId: string;
  remoteToolName: string;
  normalizedName: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  description: string;
  annotations?: Record<string, unknown>;
  descriptorHash: string;
  importedAt: string;
}
```

The hash includes:

- remote tool name,
- local normalized name,
- description,
- input schema,
- output schema,
- annotations,
- transport,
- server command or endpoint,
- declared scopes.

### 9.6 Authorization for MCP HTTP

MCP HTTP uses transport-level authorization. OCTO requirements:

- Tokens must be issued for the MCP server audience.
- OCTO must not pass through unrelated upstream tokens.
- Scope requests start minimal and elevate only on demand.
- Per-client/user consent is stored server-side where applicable.
- `insufficient_scope` is mapped to `MCP_SCOPE_DENIED`.
- OAuth discovery URLs are validated for SSRF.

### 9.7 MCP Resources and Prompts

F1 supports MCP tools only as executable capabilities.

| MCP Primitive | F1 Status | Rule |
|---|---|---|
| Tools | Supported | Imported into `ToolRegistry`. |
| Resources | Read-only adapter only | May become future retrieval inputs, not tool output by default. |
| Prompts | Deferred | Prompt templates cannot be imported into agent system prompts without separate review. |
| Sampling | Rejected for F1 | MCP servers cannot ask OCTO to sample from the model. |

---

## 10. Approval Policies and HITL

### 10.1 Policy Types

```typescript
export type ApprovalPolicy =
  | 'never_require'
  | 'always_require'
  | 'policy_based';
```

| Policy | Behavior |
|---|---|
| `never_require` | Safe read-only tools, low risk, no human approval. |
| `always_require` | High-risk or destructive tools. Always pause. |
| `policy_based` | Resolved by tenant/agent governance rules. |

### 10.2 Durable Approval Flow

```text
Tool requires approval
  -> INSERT approvals(status=PENDING)
  -> checkpoint write idx=-3 type=interrupt
  -> execution state PAUSED
  -> outbox event ApprovalRequested
  -> operator approves/rejects
  -> checkpoint write idx=-4 type=resume
  -> enqueue execution.resume
```

### 10.3 Approval UI Requirements

For every approval, the UI must display:

- tool canonical name,
- remote MCP name if applicable,
- source MCP server or builtin package,
- full parameters without truncation,
- side-effect level,
- requested scopes,
- target tenant,
- execution ID,
- agent ID,
- affected resource identifiers,
- network target if applicable,
- compensation action or non-compensatable flag,
- timeout,
- approve/reject controls,
- link to run timeline.

For MCP stdio server configuration, the UI must display the exact command and arguments that will be executed, without truncation.

### 10.4 Server-Side Validation

Client approval is not enough. The API must validate:

- approval exists,
- approval belongs to current tenant,
- approval status is `PENDING`,
- approver has required role/scope,
- execution is still `PAUSED`,
- tool descriptor hash has not changed,
- approval has not expired,
- approval decision is auditable.

### 10.5 Timeout Semantics

Default approval timeout: `24h`.

On timeout:

| Policy | Outcome |
|---|---|
| `reject_on_timeout=true` | Execution transitions to `FAILED(APPROVAL_TIMEOUT)`. |
| `reject_on_timeout=false` | Execution remains `PAUSED` and emits Ops alert. |
| `auto_reject` | Tool result injected as rejected. |
| `manual_only` | Requires operator intervention. |

F1 default is `reject_on_timeout=true` for high-risk tools.

---

## 11. Retry, Idempotency and Replay

### 11.1 Retry Eligibility

Automatic retry is allowed only when:

```text
tool.retryable = true
AND (
  sideEffectLevel = 'none'
  OR tool has a verifiable idempotency key
)
AND policy does not require manual retry
```

### 11.2 Idempotency Key

```text
idempotency_key =
  sha256(
    tenant_id + ":" +
    execution_id + ":" +
    step_index + ":" +
    tool_name + ":" +
    canonical_args_json
  )
```

### 11.3 Duplicate Handling

| Existing row | Runtime behavior |
|---|---|
| `SUCCEEDED` with same idempotency key | Return persisted result, do not re-execute. |
| `RUNNING` and lease active | Wait or return `TOOL_IN_PROGRESS`. |
| `FAILED` retryable | Re-execute if attempts remain. |
| `TIMED_OUT` retryable | Re-execute if attempts remain and side effects safe. |
| `PENDING_APPROVAL` | Reuse existing approval. |

### 11.4 Replay Rule

Replay loads persisted tool results. It does not re-execute side-effecting tools unless an operator explicitly starts a replay mode with re-execution enabled.

### 11.5 Reclaim Rule

If a worker crashes after an external side effect but before `tool_invocations` commit, OCTO cannot prove success. For high-side-effect tools, the runtime must either:

- use external idempotency keys with the target API,
- require approval and operator reconciliation,
- or mark the tool non-retryable and fail safely.

---

## 12. Schema Validation

### 12.1 Input Validation

Input is validated before execution.

```typescript
export interface ToolInputValidationError {
  code: 'TOOL_INPUT_INVALID';
  toolName: string;
  schemaPath: string;
  message: string;
}
```

Invalid input is injected as tool result; tool is not executed.

### 12.2 Output Validation

Output is validated before:

- checkpoint write,
- model reinjection,
- event publication,
- artifact creation,
- downstream tool use.

If invalid:

```json
{
  "status": "failed",
  "error_code": "TOOL_OUTPUT_INVALID",
  "message": "Tool output did not match outputSchema.",
  "retryable": false
}
```

The raw invalid output may be stored only as sanitized diagnostic payload, never as valid replay result.

### 12.3 MCP Output Schema

MCP output schema is optional in the protocol, but OCTO requires every executable F1 tool to have an OCTO `outputSchema`. If MCP server does not provide one, the operator must define a local output schema before enabling the tool.

### 12.4 Structured Content Preference

When MCP returns both text content and `structuredContent`, OCTO prefers `structuredContent` for validation. The text content is retained only as an observation or user-facing rendering.

---

## 13. Compensation Model

### 13.1 Rule

Every tool with `sideEffectLevel='high'` must declare exactly one of:

```text
compensationAction != null
OR
nonCompensatable = true
```

### 13.2 Declarative Only in F1

F1 does not perform automatic rollback. It records whether compensation exists and exposes manual operator action.

```typescript
export interface ToolCompensationDescriptor {
  toolName: string;
  compensationAction?: string;
  nonCompensatable: boolean;
  compensationRequiresApproval: true;
  notes: string;
}
```

### 13.3 Examples

| Tool | Side effect | Compensation |
|---|---|---|
| `create_ticket` | low | close ticket or add correction comment |
| `send_email` | high | non-compensatable |
| `charge_customer` | high | refund payment |
| `create_github_issue` | low | close issue |
| `delete_file` | high | restore from snapshot if available, otherwise non-compensatable |

### 13.4 Compensation Execution

Compensation action is a normal tool call:

```text
operator selects compensation
  -> approval required
  -> ToolRegistry resolves compensationAction
  -> PolicyEngine authorizes
  -> execution checkpoint created
  -> audit event ToolCompensationExecuted
```

---

## 14. Persistence Model

### 14.1 `tool_definitions`

```sql
CREATE TABLE tool_definitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  description TEXT NOT NULL,
  input_schema JSONB NOT NULL,
  output_schema JSONB NOT NULL,
  timeout_ms INTEGER NOT NULL,
  retryable BOOLEAN NOT NULL DEFAULT false,
  side_effect_level TEXT NOT NULL,
  approval_policy TEXT NOT NULL,
  tenant_scoped BOOLEAN NOT NULL DEFAULT true,
  allowed_roles JSONB NOT NULL DEFAULT '[]',
  allowed_scopes JSONB NOT NULL DEFAULT '[]',
  sandbox_profile TEXT NOT NULL,
  network_policy TEXT NOT NULL,
  egress_allowlist JSONB NOT NULL DEFAULT '[]',
  compensation_action TEXT,
  non_compensatable BOOLEAN NOT NULL DEFAULT false,
  descriptor_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, name, version),
  UNIQUE (tenant_id, name, descriptor_hash)
);
```

### 14.2 `mcp_servers`

```sql
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  transport TEXT NOT NULL, -- stdio | http
  command_json JSONB,
  endpoint_url TEXT,
  auth_profile_ref TEXT,
  sandbox_profile TEXT NOT NULL,
  egress_policy JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'DISABLED',
  last_tools_hash TEXT,
  last_probed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, name)
);
```

### 14.3 `tool_invocations`

```sql
CREATE TABLE tool_invocations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL REFERENCES executions(id),
  step_id TEXT REFERENCES execution_steps(id),
  agent_id TEXT NOT NULL,

  tool_definition_id TEXT REFERENCES tool_definitions(id),
  tool_name TEXT NOT NULL,
  tool_kind TEXT NOT NULL,
  tool_version INTEGER NOT NULL,
  descriptor_hash TEXT NOT NULL,

  status TEXT NOT NULL,
  args_json JSONB NOT NULL,
  args_hash TEXT NOT NULL,
  result_json JSONB,
  result_hash TEXT,
  error_code TEXT,
  error_message TEXT,

  requires_approval BOOLEAN NOT NULL DEFAULT false,
  approval_id TEXT REFERENCES approvals(id),
  idempotency_key TEXT NOT NULL,

  side_effect_level TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 0,

  input_schema_valid BOOLEAN NOT NULL DEFAULT false,
  output_schema_valid BOOLEAN,
  duration_ms INTEGER,
  stdout_size INTEGER,
  stderr_size INTEGER,
  exit_code INTEGER,

  trace_id TEXT NOT NULL,
  span_id TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, idempotency_key)
);
```

### 14.4 Indexes

```sql
CREATE INDEX idx_tool_definitions_tenant_status
  ON tool_definitions (tenant_id, status);

CREATE INDEX idx_tool_invocations_execution
  ON tool_invocations (tenant_id, execution_id, created_at DESC);

CREATE INDEX idx_tool_invocations_tool_status
  ON tool_invocations (tenant_id, tool_name, status, created_at DESC);

CREATE INDEX idx_tool_invocations_idempotency
  ON tool_invocations (tenant_id, idempotency_key);

CREATE INDEX idx_mcp_servers_tenant_status
  ON mcp_servers (tenant_id, status);
```

All tables are tenant-scoped and subject to ADR-F1-005 RLS.

---

## 15. Implementation Blueprint

### 15.1 TypeScript Contracts

```typescript
export const ToolKindSchema = z.enum([
  'builtin_sync',
  'builtin_async',
  'mcp_stdio',
  'mcp_http',
]);

export const SideEffectLevelSchema = z.enum(['none', 'low', 'high']);

export const ToolExecutionRequestSchema = z.object({
  tenantId: z.string().min(1),
  executionId: z.string().min(1),
  agentId: z.string().min(1),
  stepId: z.string().min(1),
  stepIndex: z.number().int().nonnegative(),
  toolName: z.string().min(1),
  argumentsJson: z.record(z.unknown()),
  idempotencyKey: z.string().min(1),
  traceId: z.string().min(1),
});

export const ToolExecutionResultSchema = z.object({
  status: z.enum(['succeeded', 'failed', 'timed_out']),
  outputJson: z.record(z.unknown()).optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
});
```

### 15.2 ToolRegistry Service

```typescript
@Injectable()
export class ToolRegistryService {
  async resolveEnabledTool(
    tenantId: string,
    toolName: string,
  ): Promise<ToolDefinition> {
    const tool = await this.db.query.toolDefinitions.findFirst({
      where: and(
        eq(toolDefinitions.tenantId, tenantId),
        eq(toolDefinitions.name, toolName),
        eq(toolDefinitions.status, 'ENABLED'),
      ),
      orderBy: desc(toolDefinitions.version),
    });

    if (!tool) {
      throw new ToolPolicyError('TOOL_NOT_ALLOWED', `Tool ${toolName} is not enabled`);
    }

    assertValidJsonSchema(tool.inputSchema);
    assertValidJsonSchema(tool.outputSchema);
    assertCompensationInvariant(tool);

    return tool;
  }
}
```

### 15.3 ToolExecutor Orchestration

```typescript
export class ToolExecutor {
  async execute(req: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const tool = await this.registry.resolveEnabledTool(req.tenantId, req.toolName);

    const validation = this.schemaValidator.validate(tool.inputSchema, req.argumentsJson);
    if (!validation.ok) {
      return this.errorResult('TOOL_INPUT_INVALID', validation.message);
    }

    const decision = await this.policy.authorize({
      tenantId: req.tenantId,
      agentId: req.agentId,
      executionId: req.executionId,
      roles: req.roles,
      scopes: req.scopes,
      tool,
      argumentsJson: req.argumentsJson,
      traceId: req.traceId,
    });

    if (decision.outcome === 'deny') {
      return this.errorResult(decision.code, decision.reason);
    }

    if (decision.outcome === 'approval_required') {
      await this.approvals.pauseForToolApproval(req, tool, decision);
      return this.errorResult('TOOL_APPROVAL_PENDING', decision.approvalReason);
    }

    const existing = await this.invocations.findSucceededByIdempotencyKey(
      req.tenantId,
      req.idempotencyKey,
    );
    if (existing) return existing.resultJson as ToolExecutionResult;

    const invocation = await this.invocations.createPending(req, tool);

    const result = await this.dispatchByKind(tool, req);

    if (result.status === 'succeeded') {
      const outputValidation = this.schemaValidator.validate(tool.outputSchema, result.outputJson);
      if (!outputValidation.ok) {
        await this.invocations.finalizeFailed(invocation.id, 'TOOL_OUTPUT_INVALID');
        return this.errorResult('TOOL_OUTPUT_INVALID', outputValidation.message);
      }
    }

    await this.invocations.finalize(invocation.id, result);
    await this.checkpoints.writeToolResult(req.executionId, result);
    await this.events.enqueueToolEvent(req, tool, result);

    return result;
  }
}
```

### 15.4 Python Runtime Adapter Interface

```python
class ToolRuntimeContext(BaseModel):
    tenant_id: str
    execution_id: str
    agent_id: str
    step_id: str
    step_index: int
    trace_id: str
    request_id: str
    workdir: str

class ToolExecutionResult(BaseModel):
    status: Literal["succeeded", "failed", "timed_out"]
    output_json: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None
    duration_ms: int
```

---

## 16. Security Hardening Requirements

### 16.1 Environment Isolation

Tool subprocesses receive a minimal environment:

```text
OCTO_TENANT_ID
OCTO_EXECUTION_ID
OCTO_TRACE_ID
OCTO_TOOL_NAME
PATH=/usr/local/bin:/usr/bin:/bin
```

Forbidden by default:

```text
DATABASE_URL
REDIS_URL
JWT_PRIVATE_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
AWS_SECRET_ACCESS_KEY
DOCKER_HOST
KUBECONFIG
HOME
SSH_AUTH_SOCK
```

A tool may receive a specific secret only through an explicit `SecretRef` binding scoped to that tool and tenant.

### 16.2 Filesystem

| Path | Access |
|---|---|
| `/tmp/octo/{tenant_id}/{execution_id}/{tool_name}` | read/write |
| `/workspace` | none by default |
| `/home` | forbidden |
| `/var/run/docker.sock` | forbidden |
| `/etc` | read-only or hidden |
| mounted secrets | forbidden unless explicit SecretRef |

### 16.3 Network

Default network policy: `none`.

`mcp_http` may use `egress_allowlist`.

Blocked by default:

- link-local metadata endpoints,
- RFC1918 private IP ranges,
- loopback except local development,
- Redis/PostgreSQL internal addresses,
- Docker daemon,
- Kubernetes API,
- unapproved wildcard domains.

### 16.4 Process Controls

- timeout per invocation,
- stdout/stderr caps,
- max output bytes,
- pids limit,
- memory limit,
- no privileged mode,
- no additional Linux capabilities,
- seccomp/AppArmor profile where available,
- non-root user,
- read-only filesystem for container tools.

### 16.5 Supply Chain Controls

- tool package versions pinned,
- lockfiles required,
- container image scanning,
- SBOM generated,
- descriptor hash signed where possible,
- MCP server allowlist per tenant,
- no auto-enable from public registries in F1.

---

## 17. Observability and Audit Trail

### 17.1 Audit Fields

Every `tool_invocations` row records:

```text
tenant_id
execution_id
agent_id
step_id
tool_name
tool_kind
tool_version
descriptor_hash
args_hash
args_json_sanitized
result_hash
result_json
status
error_code
error_message
requires_approval
approval_id
idempotency_key
side_effect_level
duration_ms
stdout_size
stderr_size
exit_code
trace_id
span_id
started_at
ended_at
```

### 17.2 Events

F1 publishes these events through the outbox (ADR-F1-006):

| Event | Trigger |
|---|---|
| `ToolInvocationRequested` | Model emits tool call. |
| `ToolInvocationDenied` | Registry or policy denies. |
| `ToolApprovalRequested` | Approval gate pauses execution. |
| `ToolInvocationStarted` | Execution begins. |
| `ToolInvocationCompleted` | Output validated and persisted. |
| `ToolInvocationFailed` | Tool failed or output invalid. |
| `ToolInvocationTimedOut` | Hard timeout killed tool. |
| `ToolCompensationRequested` | Operator starts compensation. |
| `ToolCompensationCompleted` | Compensation tool succeeds. |

### 17.3 OpenTelemetry Attributes

```text
octo.tenant_id
octo.execution_id
octo.agent_id
octo.tool.name
octo.tool.kind
octo.tool.side_effect_level
octo.tool.status
octo.tool.retry_count
octo.tool.requires_approval
octo.tool.idempotency_key_hash
octo.mcp.server_id
octo.mcp.transport
```

### 17.4 Prometheus Metrics

```text
octo_tool_invocation_total{tool_name,tool_kind,status}
octo_tool_duration_seconds_bucket{tool_name,tool_kind}
octo_tool_timeout_total{tool_name}
octo_tool_approval_pending_total{tool_name}
octo_tool_schema_validation_failed_total{tool_name,direction}
octo_tool_policy_denied_total{tool_name,reason}
octo_mcp_server_probe_total{server_id,status}
octo_mcp_descriptor_changed_total{server_id}
octo_tool_sandbox_kill_total{tool_name,reason}
```

### 17.5 Logging Rules

- Never log full secrets.
- Log argument hashes and sanitized JSON.
- Truncate stdout/stderr in logs, store full valid result only if required for replay.
- Include trace IDs in all tool logs.
- Log every policy denial.

---

## 18. Failure and Recovery Model

| Failure | Detection | Recovery |
|---|---|---|
| Tool name unknown | Registry miss | Inject `TOOL_NOT_ALLOWED`, continue. |
| Invalid input | Schema validator | Inject `TOOL_INPUT_INVALID`, no execution. |
| Policy denial | PolicyEngine | Inject denial result, audit. |
| Approval timeout | Approval watchdog | Fail or remain paused according to policy. |
| Subprocess timeout | Parent process timer | Kill process, mark `TIMED_OUT`, retry if safe. |
| MCP stdio spawn fails | Spawn error | Mark `MCP_SERVER_UNAVAILABLE`, retry if safe. |
| MCP descriptor changed | Hash mismatch | Disable tool, request operator review. |
| MCP HTTP auth fails | HTTP 401/403 | Map to `MCP_AUTH_FAILED` or `MCP_SCOPE_DENIED`. |
| SSRF target detected | Egress validator | Block before request, audit. |
| Output invalid | Output schema validator | Do not checkpoint as valid, inject `TOOL_OUTPUT_INVALID`. |
| Worker crash before commit | DB lacks invocation final state | Reclaim re-executes only if idempotent/safe. |
| Worker crash after commit | DB has invocation result | Reclaim uses persisted result. |

---

## 19. Invariants

**I-TL1 — Registry required.** No tool executes without an enabled `ToolDefinition`.

**I-TL2 — MCP never bypasses OCTO runtime.** MCP tools are normalized into ToolRegistry and executed by `ToolExecutor`.

**I-TL3 — Schema validation is mandatory.** Input is validated before execution; output is validated before checkpoint and LLM reinjection.

**I-TL4 — Sandbox by default.** Builtin tools and MCP stdio servers run outside the main runtime process with minimal env and filesystem access.

**I-TL5 — No global secrets.** Tool subprocesses never inherit infrastructure secrets.

**I-TL6 — No Docker socket.** Tool sandboxes and MCP stdio servers cannot access `/var/run/docker.sock`.

**I-TL7 — High side effects require approval.** `sideEffectLevel='high'` tools require HITL unless an explicit, audited tenant exception exists.

**I-TL8 — High side effects require compensation metadata.** `sideEffectLevel='high'` requires `compensationAction` or `nonCompensatable=true`.

**I-TL9 — Retry requires safety.** Automatic retry requires `retryable=true` and either no side effects or verifiable idempotency.

**I-TL10 — Replay does not re-execute side effects.** Replay uses persisted tool results unless operator explicitly opts into re-execution.

**I-TL11 — MCP descriptor changes require review.** Tool descriptor hash changes move the tool to `PENDING_REVIEW`.

**I-TL12 — Approval UI must be complete.** Approval UI shows all parameters and exact commands without truncation for MCP stdio and destructive operations.

**I-TL13 — Tenant scope is enforced.** `tenantScoped=true` tools cannot access data or credentials outside the active execution tenant.

**I-TL14 — Every invocation is auditable.** All tool calls produce `tool_invocations`, OTel spans and outbox events.

---

## 20. Alternatives Rejected

| Alternative | Rejection Reason |
|---|---|
| Execute tool calls directly from model output | Enables arbitrary function/binary invocation and prompt-injection escalation. |
| Trust MCP `tools/list` automatically | Tool poisoning and descriptor drift make dynamic discovery unsafe without review. |
| Run builtin tools in runtime process | Tool crash, memory leak or exploit could compromise runtime worker. |
| Give tools global env secrets | Expands blast radius and enables exfiltration. |
| Use MCP as a parallel runtime | Breaks OCTO checkpointing, audit, approval and policy guarantees. |
| Retry all failed tools | Replays external side effects and can duplicate irreversible actions. |
| Persist raw invalid output as valid result | Breaks replay correctness and may poison model context. |
| Automatic compensation in F1 | Too risky before operator workflows and idempotent compensation contracts mature. |
| Dynamic MCP marketplace auto-install | Supply-chain and tool poisoning risk; explicit review required in F1. |

---

## 21. Consequences

### 21.1 Positive

- Tools cannot execute unless registered, authorized and audited.
- MCP compatibility does not weaken security boundaries.
- Prompt injection blast radius is reduced by allowlists, schemas, policies and HITL.
- Tool side effects are explicit, traceable and compensatable where possible.
- Replay stays deterministic because tool results are checkpointed.
- Operators can inspect every tool call in the run timeline.
- Descriptor hash pinning prevents silent MCP tool drift.
- Sandboxing limits damage from tool bugs or malicious dependencies.

### 21.2 Negative

- Subprocess/container execution adds latency.
- MCP stdio spawn-per-call may be expensive for slow servers.
- Operators must review imported tools.
- Developers must maintain input/output schemas.
- High-risk tools may pause executions for hours.
- Some external side effects cannot be made truly exactly-once.
- Network allowlists require operational discipline.

### 21.3 Mitigations

- F1 accepts latency for safety; F2 may introduce warm pools with identical sandbox controls.
- Tool review can be assisted by heuristics and descriptor diffs.
- CI validates schemas, compensation metadata and security policy.
- Idempotency keys reduce duplicate side effects.
- Dashboards expose approval backlog and tool latency.

---

## 22. Cross-Framework Validation

| Source | Pattern Observed | OCTO Adoption |
|---|---|---|
| CrewAI | Explicit tools and role/task boundaries; code execution needs layered safety. | `ToolRegistry`, side-effect classification and sandbox profiles. |
| LangGraph | Durable state, checkpoints and human-in-the-loop execution. | Tool results are checkpoint writes, not volatile observations. |
| Flowise | Visual tool/RAG builder requires schema-like integration contracts. | Tools become catalog entries with input/output schemas and assignment by level. |
| Semantic Kernel | Plugins/functions are typed capabilities exposed to the model. | OCTO maps tools to typed contracts and validates arguments/results. |
| Microsoft Agent Framework | Tools and agent observability patterns, plus managed tool execution examples. | Approval policies and OTel spans for tool calls. |
| n8n | Production task runners are isolated from the main process in external mode. | Builtin code tools execute out-of-process, not inside runtime worker. |
| AutoGen | Docker command-line code executor pattern for code execution. | High-risk code/browser tools use hardened containers. |
| Paperclip | Budget/governance discipline for agent work. | Tool permissions, approval gates and retry budgets are governance objects. |
| Rowboat | MCP as primary extension surface and memory/artifact-oriented work. | MCP enters via Hub/Registry, not ad hoc integrations. |
| Lattice / AgentNeo / AgentLens / noaide / WorkGraph | Execution visualization and traceability. | Every tool call emits timeline events, JSONL-compatible logs and OTel spans. |
| Microsoft AI Agents for Beginners | Tool use requires schemas, validation, state and reliable execution; production agents need observability. | Canonical tool contracts, durable state and OTel instrumentation. |
| MCP Specification | Tools expose `tools/list`, `tools/call`, input schema and optional output schema. | MCP adapter normalizes descriptors into ToolRegistry. |
| MCP Security Best Practices | Human consent, exact command display, sandboxing, least privilege, SSRF protections and scope minimization. | Approval UI, stdio sandbox, egress validation and minimal scopes. |
| OWASP LLM Top 10 2025 | Prompt injection, excessive agency, improper output handling and supply-chain risks. | Tool allowlist, HITL, output validation and descriptor review. |

---

## 23. Validation Test Suite

### 23.1 Unit Tests

- [ ] Unknown tool name returns `TOOL_NOT_ALLOWED`.
- [ ] Disabled tool returns `TOOL_NOT_ALLOWED`.
- [ ] Descriptor hash mismatch returns `TOOL_DESCRIPTOR_CHANGED`.
- [ ] Invalid input returns `TOOL_INPUT_INVALID`.
- [ ] Invalid output returns `TOOL_OUTPUT_INVALID`.
- [ ] `sideEffectLevel='high'` without `compensationAction` and `nonCompensatable=false` fails schema validation.
- [ ] `retryable=true` with side effects and no idempotency guarantee fails tool definition validation.
- [ ] MCP imported tool without output schema cannot be enabled.
- [ ] Tool description scanner flags hidden instruction patterns.

### 23.2 Integration Tests

- [ ] Builtin tool executes in subprocess and returns valid result.
- [ ] Tool timeout kills subprocess and records `TIMED_OUT`.
- [ ] Tool subprocess cannot read `DATABASE_URL`.
- [ ] Tool subprocess cannot access Docker socket.
- [ ] Tool working directory is tenant/execution scoped.
- [ ] Duplicate idempotency key returns previous result without re-execution.
- [ ] `requiresApproval=true` pauses execution and resumes after approval.
- [ ] Approval rejection injects structured rejection result.
- [ ] MCP stdio tool follows initialize -> tools/list -> tools/call -> terminate.
- [ ] MCP stdio descriptor hash mismatch blocks execution.
- [ ] MCP HTTP blocks private IP / metadata endpoint URL.
- [ ] MCP HTTP maps `insufficient_scope` to structured error.
- [ ] Output validation failure does not checkpoint invalid result as valid.
- [ ] Worker crash after tool success uses persisted result on reclaim.

### 23.3 Security Tests

- [ ] Prompt injection asking for unregistered shell command is denied.
- [ ] Tool poisoning in description creates review warning.
- [ ] MCP `tools/list_changed` moves changed tool to `PENDING_REVIEW`.
- [ ] Approval modal renders full arguments without truncation.
- [ ] Server-side approval validation rejects stale/expired approval.
- [ ] SSRF payloads to `169.254.169.254`, `127.0.0.1`, `10.0.0.0/8` are blocked.
- [ ] Secrets are redacted from logs and not present in subprocess env.
- [ ] High-risk tool cannot execute without approval.

### 23.4 Load Tests

- [ ] 50 concurrent executions with safe builtin tools p95 tool latency within policy.
- [ ] 200 tool invocations/hour produce no audit gaps.
- [ ] MCP stdio spawn latency dashboard shows p95 and timeout distribution.
- [ ] Approval backlog metrics update within 5 seconds.

---

## 24. Operational Runbook

### 24.1 Tool Disabled Due to Descriptor Change

1. Open `Settings -> MCP -> Server -> Tools`.
2. Review diff between old and new descriptor.
3. Verify input/output schema.
4. Reclassify side-effect level if needed.
5. Re-approve and enable.
6. Confirm audit event `ToolDescriptorApproved`.

### 24.2 Stuck Approval

1. Open `Approvals`.
2. Filter by `tool_name` and `execution_id`.
3. Inspect parameters and side-effect level.
4. Approve, reject or expire.
5. Verify execution resumes through `execution.resume` command.

### 24.3 Tool Timeout Spike

1. Check `octo_tool_timeout_total`.
2. Inspect `tool_invocations` for tool and tenant.
3. Review stdout/stderr truncation.
4. Confirm timeout policy and external API health.
5. Disable tool if failure is unsafe.
6. Open incident if p95 exceeds SLO.

### 24.4 Suspected Tool Exfiltration

1. Disable the tool definition.
2. Revoke related MCP server credentials.
3. Query audit logs by `tool_name`, `tenant_id`, `trace_id`.
4. Inspect egress logs and output payload hashes.
5. Notify tenant owner.
6. Rotate any exposed SecretRefs.
7. Add regression security test.

### 24.5 MCP Server Compromise

1. Disable `mcp_server.status`.
2. Mark all imported tools as `REVOKED`.
3. Revoke auth profile.
4. Review descriptor hash changes.
5. Review invocations since last known-good probe.
6. Rotate credentials.
7. Re-enable only after manual verification.

---

## 25. Exit Criteria Integration

F1 cannot be declared STABLE until:

| Requirement | Blocking Test |
|---|---|
| Registry enforcement | Unknown/disabled tools denied and injected as structured result. |
| Schema enforcement | Invalid inputs and outputs blocked. |
| Sandboxing | Tool subprocess lacks `DATABASE_URL`, Docker socket and host filesystem. |
| MCP compatibility | MCP stdio and HTTP tools execute through `ToolExecutor`, not bypass path. |
| Approval durability | High-risk tool pauses, survives restart and resumes after approval. |
| Replay safety | Side-effect tool result is loaded from checkpoint, not re-executed. |
| Descriptor integrity | MCP tool changes require operator review. |
| Audit completeness | Every invocation has DB row, event, trace and sanitized logs. |
| Idempotency | Duplicate idempotency key returns previous success. |
| SSRF protection | MCP HTTP blocks internal and metadata endpoints. |
| Compensation invariant | High-risk tool declares compensation or non-compensatable. |

---

## 26. Related ADRs

| ADR | Relationship |
|---|---|
| ADR-F1-001 — Durable Execution Semantics | Tool calls are durable steps and participate in replay/reclaim. |
| ADR-F1-002 — Replay Semantics and Determinism Rules | Tool outputs are persisted to avoid non-deterministic re-execution. |
| ADR-F1-003 — Checkpoint Persistence Model and Lineage Validation | Tool results are checkpoint writes. |
| ADR-F1-004 — LiteLLM Abstraction Boundary and Provider Routing | Tool definitions are sent to LLM through provider abstraction. |
| ADR-F1-005 — Tenant Isolation, JWT Claims y PostgreSQL RLS | Tool invocations are tenant-scoped and protected by RLS. |
| ADR-F1-006 — Event Bus Split | Tool events are published through outbox and Redis Streams. |

---

## 27. References

### OCTO Internal

- `OCTO-v5-arquitectura.md` — MCP as official extensibility layer; ToolGuard; security and trust; tool sandboxing requirements.
- `F1.md` — F1 Tool Execution System, ToolRegistry, sandboxing, MCP compatibility, idempotency and audit trail.
- `F0.md` — foundation boundaries: Control Plane vs Execution Plane, PostgreSQL as system of record, observability first.
- GitHub Issue #100 — `[F1-ADR-007] Tool Sandboxing y MCP Compatibility`.

### Protocols and Security

- Model Context Protocol — Tools specification: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- Model Context Protocol — Authorization: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- Model Context Protocol — Security Best Practices: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
- OWASP Top 10 for LLM Applications 2025: https://genai.owasp.org/llm-top-10/
- OWASP LLM01 Prompt Injection: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- Microsoft AI Agents for Beginners — Tool Use: https://microsoft.github.io/ai-agents-for-beginners/translations/es/04-tool-use/
- Microsoft AI Agents for Beginners — Trustworthy Agents: https://microsoft.github.io/ai-agents-for-beginners/translations/es/06-building-trustworthy-agents/
- Microsoft AI Agents for Beginners — Production Observability: https://microsoft.github.io/ai-agents-for-beginners/translations/es/10-ai-agents-production/
- Microsoft AI Agents for Beginners — Agentic Protocols: https://microsoft.github.io/ai-agents-for-beginners/translations/es/11-agentic-protocols/

### Reference Repositories

- CrewAI: https://github.com/crewaiinc/crewai
- LangGraph: https://github.com/langchain-ai/langgraph
- Flowise: https://github.com/flowiseai/flowise
- Semantic Kernel: https://github.com/microsoft/semantic-kernel
- Hermes Chief of Staff: https://github.com/TheCraigHewitt/hermes-chief-of-staff
- Microsoft Agent Framework: https://github.com/microsoft/agent-framework
- n8n: https://github.com/n8n-io/n8n
- AutoGen: https://github.com/microsoft/autogen
- Paperclip: https://github.com/paperclipai/paperclip
- Lattice: https://github.com/DahunHan/lattice
- Neurite: https://github.com/satellitecomponent/Neurite
- AgentNeo: https://github.com/GOURIKP/AgentNeo
- noaide: https://github.com/silentspike/noaide
- AgentLens: https://github.com/23min/agent-lens
- Agent WorkGraph: https://github.com/ranausmanai/agent-workgraph
- Rowboat: https://github.com/rowboatlabs/rowboat

---

**Status Change:** This ADR moves from **Proposed** to **Accepted**. The accepted decision is that OCTO F1 supports builtin and MCP tools only through a single sandboxed, policy-governed, schema-validated and auditable `ToolExecutor`. MCP is compatible by adapter, not by bypass. These requirements are **blocking for F1 complete**.
