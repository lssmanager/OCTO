export type RuntimeInvokePayload = {
  executionId: string;
  tenantId: string;
  agentId: string;
  traceId: string;
  correlationId: string;
  runId: string;
  queueJobId: string;
  mode?: 'normal' | 'reclaim';
  reason?: 'dispatch' | 'reclaim_replay';
  leaseOwner: string;
  leaseToken: string;
  attempt: number;
};

export class RuntimeInvocationError extends Error {
  constructor(
    message: string,
    readonly details: {
      readonly runtimeUrl: string;
      readonly status?: number;
      readonly responseBody?: string;
      readonly cause?: unknown;
      readonly timeoutMs?: number;
    }
  ) {
    super(message);
    this.name = 'RuntimeInvocationError';
  }
}

export async function invokeRuntimeHttp(
  runtimeUrl: string,
  runtimeSecret: string,
  payload: RuntimeInvokePayload,
  timeoutMs: number = Number(process.env['RUNTIME_INVOKE_TIMEOUT_MS'] ?? '10000')
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(runtimeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': runtimeSecret,
      },
      ...(timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      body: JSON.stringify({
        executionId: payload.executionId,
        tenantId: payload.tenantId,
        agentId: payload.agentId,
        traceId: payload.traceId,
        correlationId: payload.correlationId,
        runId: payload.runId,
        queueJobId: payload.queueJobId,
        mode: payload.mode ?? 'normal',
        reason: payload.reason ?? (payload.mode === 'reclaim' ? 'reclaim_replay' : 'dispatch'),
        leaseOwner: payload.leaseOwner,
        leaseToken: payload.leaseToken,
        attempt: payload.attempt,
      }),
    });
  } catch (cause) {
    console.error(JSON.stringify({ msg: 'execution_runtime_invoke_network_failed',
      executionId: payload.executionId,
      tenantId: payload.tenantId,
      traceId: payload.traceId,
      correlationId: payload.correlationId,
      runId: payload.runId,
      queueJobId: payload.queueJobId,
      runtimeUrl,
      error: cause instanceof Error ? cause.message : String(cause),
      timeoutMs,
    }));
    throw new RuntimeInvocationError('runtime_network_failed', { runtimeUrl, cause, timeoutMs });
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    console.error(JSON.stringify({ msg: 'execution_runtime_invoke_http_failed',
      executionId: payload.executionId,
      tenantId: payload.tenantId,
      traceId: payload.traceId,
      correlationId: payload.correlationId,
      runId: payload.runId,
      queueJobId: payload.queueJobId,
      runtimeUrl,
      status: response.status,
      responseBody,
      timeoutMs,
    }));
    throw new RuntimeInvocationError('runtime_http_failed', {
      runtimeUrl,
      status: response.status,
      responseBody,
      timeoutMs,
    });
  }

  console.info(JSON.stringify({ msg: 'execution_runtime_invoked',
    executionId: payload.executionId,
    tenantId: payload.tenantId,
    traceId: payload.traceId,
    correlationId: payload.correlationId,
    runId: payload.runId,
    queueJobId: payload.queueJobId,
    runtimeUrl,
    status: response.status,
    mode: payload.mode ?? 'normal',
    reason: payload.reason ?? (payload.mode === 'reclaim' ? 'reclaim_replay' : 'dispatch'),
    leaseOwner: payload.leaseOwner,
    leaseToken: payload.leaseToken,
    attempt: payload.attempt,
    timeoutMs,
  }));
}
