// apps/web/src/lib/ops.ts
// Server-side data fetching for the /ops console.
// ONLY called from Server Components — never imported in client components.

const API_URL = process.env['API_URL'] ?? 'http://localhost:3001';

export interface OpsBuildInfo {
  version: string;
  commit: string;
  phase: string;
  builtAt: string;
  node: string;
}

export interface OpsServiceStatus {
  status: string;
  uptime?: number;
  latencyMs?: number;
  error?: string;
}

export interface OpsQueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface OpsStatusData {
  build: OpsBuildInfo;
  services: {
    api: OpsServiceStatus;
    db: OpsServiceStatus;
    redis: OpsServiceStatus;
  };
  queues: Record<string, OpsQueueStats>;
  timestamp: string;
}

export interface OpsStatusResult {
  data: OpsStatusData | null;
  error?: string;
  fetchedAt: string;
}

export async function getOpsStatus(): Promise<OpsStatusResult> {
  try {
    const res = await fetch(`${API_URL}/api/ops/status`, {
      next: { revalidate: 15 },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return {
        data: null,
        error: `HTTP ${res.status}: ${res.statusText}`,
        fetchedAt: new Date().toISOString(),
      };
    }

    const data = (await res.json()) as OpsStatusData;
    return { data, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : String(err),
      fetchedAt: new Date().toISOString(),
    };
  }
}
