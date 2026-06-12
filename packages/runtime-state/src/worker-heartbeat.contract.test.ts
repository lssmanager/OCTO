import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readWorkerHeartbeatSource(): string {
  return readFileSync(join(__dirname, 'worker-heartbeat.ts'), 'utf8');
}

describe('worker heartbeat SQL contract', () => {
  it('upserts on the primary key so drifted unique indexes do not break heartbeats', () => {
    const source = readWorkerHeartbeatSource();

    expect(source).toContain('ON CONFLICT (id)');
    expect(source).not.toContain('ON CONFLICT (worker_type, instance_id)');
  });
});
