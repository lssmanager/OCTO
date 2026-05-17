/**
 * Server-side data fetching for health and version endpoints.
 * ONLY called from Server Components — never imported in client components.
 * NO direct calls to runtime-worker from browser (Architecture Principle).
 */

const API_URL = process.env['API_URL'] ?? 'http://localhost:3001';
const RUNTIME_WORKER_URL =
  process.env['RUNTIME_WORKER_URL'] ?? 'http://localhost:8000';

export interface ServiceHealth {
  status: 'ok' | 'error' | 'unknown';
  service?: string;
  version?: string;
  phase?: string;
  latencyMs?: number;
  error?: string;
  checks?: Record<string, unknown>;
}

export interface SystemHealthData {
  api: ServiceHealth;
  runtime: ServiceHealth;
  fetchedAt: string;
}

export interface VersionInfo {
  version?: string;
  phase?: string;
  commit?: string;
  buildTime?: string;
  nodeEnv?: string;
  apiUrl?: string;
}

async function fetchHealth(
  url: string,
  label: string,
): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const res = await fetch(`${url}/health`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return {
        status: 'error',
        service: label,
        latencyMs,
        error: `HTTP ${res.status} ${res.statusText}`,
      };
    }

    const data = (await res.json()) as Record<string, unknown>;
    return {
      status: 'ok',
      service: typeof data['service'] === 'string' ? data['service'] : label,
      version: typeof data['version'] === 'string' ? data['version'] : undefined,
      phase: typeof data['phase'] === 'string' ? data['phase'] : undefined,
      checks: typeof data['checks'] === 'object' && data['checks'] !== null
        ? (data['checks'] as Record<string, unknown>)
        : undefined,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message =
      err instanceof Error ? err.message : 'Connection refused';
    return {
      status: 'error',
      service: label,
      latencyMs,
      error: message,
    };
  }
}

export async function getSystemHealth(): Promise<SystemHealthData> {
  const [api, runtime] = await Promise.all([
    fetchHealth(API_URL, 'api'),
    fetchHealth(RUNTIME_WORKER_URL, 'runtime-worker'),
  ]);

  return {
    api,
    runtime,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getVersionInfo(): Promise<VersionInfo> {
  return {
    version: process.env['npm_package_version'] ?? '0.0.1-f0',
    phase: 'F0',
    commit: process.env['GIT_COMMIT'] ?? 'local',
    buildTime: process.env['BUILD_TIME'] ?? new Date().toISOString(),
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
    apiUrl: API_URL,
  };
}
