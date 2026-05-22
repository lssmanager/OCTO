/**
 * @octo/contracts — Ops status contract
 *
 * Canonical shape of the GET /ops/status response.
 * Consumed by apps/api OpsController and any future observability consumers.
 */

export interface OpsQueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface OpsStatus {
  build: {
    version: string;
    commit: string;
    phase: string;
    builtAt: string;
    node: string;
  };
  services: {
    api: { status: string; uptime: number };
    db: { status: string; latencyMs?: number; error?: string };
    redis: { status: string; latencyMs?: number; error?: string };
  };
  queues: Record<string, OpsQueueStats>;
  timestamp: string;
}
