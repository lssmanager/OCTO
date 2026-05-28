# Trace Propagation — TypeScript → Python Worker

This document explains how distributed traces cross the BullMQ boundary
between the TypeScript control plane and the Python runtime worker.

## Architecture

```
HTTP Request (API)
  └─ span: POST /executions            [api, SpanKind.SERVER]
       └─ span: octo:execution publish  [queue, SpanKind.PRODUCER]
            │  job.data.traceparent = "00-<trace-id>-<span-id>-01"
            └─ span: octo:execution process  [embedding/runtime-worker, SpanKind.CONSUMER]
                 └─ span: runtime.execution    [python runtime-worker, SpanKind.INTERNAL]
```

## TypeScript (Producer side)

`InstrumentedQueue.add()` automatically calls `injectTraceparent(data)` before
enqueuing. This serializes the active OTel context as a W3C `traceparent`
header string into `job.data.traceparent`.

```typescript
// packages/queue/src/instrumented-queue.ts
const instrumentedData = injectTraceparent(data);
await queue.add(jobName, instrumentedData, opts);
```

## TypeScript (Consumer side)

`createInstrumentedWorker()` extracts the context before starting the
processor span, making the processor span a child of the enqueue span:

```typescript
// packages/queue/src/instrumented-worker.ts
const parentCtx = extractTraceparent(job.data);
return tracer.startActiveSpan('octo:execution process', {}, parentCtx, async (span) => {
  await processor(job);
});
```

## Python (Runtime worker)

The Python runtime worker reads `job_data['traceparent']` and uses the
OpenTelemetry Python SDK to restore the trace context:

```python
# apps/runtime-worker/src/tracing.py
from opentelemetry.propagators.textmap import DefaultGetter
from opentelemetry.propagate import extract
from opentelemetry import trace

def get_parent_context(job_data: dict):
    """Restore OTel context from W3C traceparent embedded in BullMQ job data."""
    traceparent = job_data.get('traceparent')
    if not traceparent:
        return None
    carrier = {'traceparent': traceparent}
    return extract(carrier)

# In worker processor:
parent_ctx = get_parent_context(job_data)
tracer = trace.get_tracer('octo-runtime-worker')
with tracer.start_as_current_span('runtime.execution', context=parent_ctx) as span:
    span.set_attribute('octo.execution.id', job_data['executionId'])
    span.set_attribute('octo.agent.id', job_data['agentId'])
    # ... execute
```

## Validating in Grafana

1. Open Grafana → Explore → Tempo datasource
2. Search by `trace_id` (from `execution.traceId` in the DB)
3. You should see a waterfall: `POST /executions` → `octo:execution publish`
   → `octo:execution process` → `runtime.execution`
4. All spans share the same `trace_id` — this confirms end-to-end propagation works

## contracts.py — Python contract validation

The Python worker validates incoming job data against the generated Pydantic models:

```python
# apps/runtime-worker/src/worker.py
from contracts import ExecutionJobData  # generated/contracts.py
from pydantic import ValidationError

def process_job(job_data: dict):
    try:
        payload = ExecutionJobData(**job_data)
    except ValidationError as e:
        raise ValueError(f'Contract violation: {e}') from e
    # payload is now fully validated and typed
    return execute(payload)
```

To regenerate contracts.py after schema changes:
```bash
cd packages/contracts
pnpm codegen
git add generated/contracts.py
git commit -m "chore(contracts): regenerate contracts.py"
```
