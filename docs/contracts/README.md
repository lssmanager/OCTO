# @octo/contracts + @octo/events — Contract Reference

> **"Todo el sistema girará alrededor de eventos. Si los contratos de eventos son malos, todo lo que se construye encima es malo."**

## Por qué los contratos son críticos

Los contratos son el **lenguaje compartido** entre Control Plane (TypeScript) y
Runtime Worker (Python), entre API y Frontend, y entre servicios que aún no existen
en F1, F2, F3. Un contrato mal definido en F0 genera breaking changes en cada fase,
incompatibilidades TS ↔ Python, y migraciones costosas.

Se definen **antes** de que exista runtime, UI o workers.

## Paquetes

| Paquete | Propósito |
|---|---|
| `@octo/contracts` | Tipos TypeScript puros — **cero deps runtime** |
| `@octo/events` | `IEventBus` + `createEvent` builder + payload types tipados |

## Primitivos de @octo/contracts

### `ExecutionRequest`

Contrato que viaja de **API → BullMQ queue → Python worker**.

```typescript
import type { ExecutionRequest } from '@octo/contracts';

const req: ExecutionRequest = {
  agentId: 'agent-123',
  task: { id: 'task-1', type: 'llm_call', input: { prompt: '...' } },
  governance: {
    tokenBudget: 4000,      // Paperclip: hard limit
    maxIterations: 10,      // CrewAI: max_iter
    maxDelegationDepth: 2,  // Hermes
    allowedTools: ['search', 'calculator'],
    requireApproval: false,
    timeoutMs: 30000,
  },
  traceId: 'trace-abc-123',  // OBLIGATORIO — OTEL
};
```

### `GovernancePolicy` (value object)

Viaja **embebido en cada `ExecutionRequest`**. Patrón Paperclip: sin governance
no hay ejecución. Distinto de `GovernancePolicy` en `src/policy.ts` que es la
entidad de configuración persistida en DB.

| Campo | Patrón | Descripción |
|---|---|---|
| `tokenBudget` | Paperclip | Límite hard de tokens — no negociable |
| `maxIterations` | CrewAI `max_iter` | Ciclos máximos de razonamiento |
| `maxDelegationDepth` | Hermes | Profundidad máxima de delegación |
| `allowedTools` | MCP whitelist | Herramientas permitidas (array vacío = ninguna) |
| `requireApproval` | Human-in-the-loop | Pausa para aprobación en acciones críticas |
| `timeoutMs` | — | Timeout total de la ejecución |

### `OctoEvent<T>` + `EventMetadata`

Envuelve cualquier payload. `EventMetadata` incluye campos obligatorios para
observabilidad desde F0:

| Campo | Por qué es obligatorio |
|---|---|
| `traceId` | Conecta el evento con el span OTEL de la request original |
| `runId` | Agrupa todos los eventos de un mismo workflow multi-paso |
| `version: '1.0'` | Permite migración de schema de eventos en F2+ |
| `source` | Identifica el servicio emisor (debugging en sistemas distribuidos) |

### `ExecutionStatus`

```
pending → queued → running → completed
                  running → paused → running  (human-in-the-loop)
                  running → awaiting_approval → running / cancelled
                  running → failed
                  * → cancelled
```

## @octo/events

### `createEvent` builder

El builder inyecta `timestamp` y `version` automáticamente. El caller solo
provee los campos de negocio:

```typescript
import { createEvent } from '@octo/events';
import type { ExecutionStartedPayload } from '@octo/events';

const event = createEvent<ExecutionStartedPayload>(
  'ExecutionStarted',
  {
    executionId: 'exec-123',
    agentId: 'agent-456',
    taskType: 'llm_call',
    governance,
  },
  {
    traceId: 'trace-abc',
    runId: 'run-789',
    source: 'api',
    executionId: 'exec-123',
    agentId: 'agent-456',
  },
);
// event.metadata.timestamp y event.metadata.version los inyecta el builder
```

### `IEventBus`

Interfaz pura — la implementación concreta (BullMQ + Redis) vive en
`packages/queue` y se implementa en F1.

```typescript
import type { IEventBus } from '@octo/events';

// Inyectar via DI en NestJS:
// @Inject(EVENT_BUS_TOKEN) private readonly eventBus: IEventBus
```

## Python mirror canónico de F1

El source of truth cross-language de F1 es `packages/contracts/src/zod/*`. El flujo
canónico es:

1. `pnpm contracts:build` genera `packages/contracts/generated/json-schema/*.json`.
2. `pnpm contracts:python` genera `apps/runtime-worker/app/contracts/generated/*.py`.
3. `pnpm contracts:validate` valida JSON Schema con Ajv 8 + formatos reales,
   conformance TS/Python y drift de artefactos generados.

`apps/runtime-worker/src/contracts.py` queda solo como referencia legacy/manual y no
debe usarse para parity o source-of-truth F1. Si un contrato Zod cambia, el mismo
commit debe actualizar los JSON Schema generados y los modelos Pydantic generados
bajo `apps/runtime-worker/app/contracts/generated/`.

### Reglas de sincronización generada

| TypeScript / JSON Schema | Python generado |
|---|---|
| `camelCase` | alias Pydantic con campo `snake_case` |
| `Record<string, unknown>` | `dict[str, Any]` |
| `string` literal union / enum | `StrEnum` / literales generados |
| `T \| undefined` (optional field) | campo Pydantic opcional/default generado |
| `T \| null` | `T | None` |
| `number` | `int` o `float` según JSON Schema |
| `boolean` | `bool` |

**Regla crítica**: no edites los modelos generados a mano para resolver drift;
actualiza el Zod canónico y regenera.

## ADRs fuente

- `F0-006-mcp-a2a-protocol-contracts.md` — MCP tool protocol, A2A agent protocol
- `F0-007-autogen-groupchat-patterns.md` — Message contracts, ChatMessage types
- `F0-008-crewai-agent-role-patterns.md` — AgentNode, TaskDefinition, max_iter
- `F0-009-hermes-coordinator-patterns.md` — DelegationContext, coordinator chain
- `F0-010-paperclip-budget-governance-contracts.md` — TokenBudget, GovernancePolicy
- `F0-015-observability-strategy.md` — traceId, runId en EventMetadata
