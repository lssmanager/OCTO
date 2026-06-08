import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { executions, toolInvocations } from './schema';

describe('F1 reclaim runtime schema smoke', () => {
  it('keeps reclaim columns and stable tool-call identity in schema and migration', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'packages/database/migrations/202606080001_f1_reclaim_runtime_hardening.sql'
      ),
      'utf8'
    );

    expect(executions.reclaimedAt.name).toBe('reclaimed_at');
    expect(executions.reclaimCount.name).toBe('reclaim_count');
    expect(executions.leaseOwner.name).toBe('lease_owner');
    expect(executions.leaseToken.name).toBe('lease_token');
    expect(executions.attempt.name).toBe('attempt');
    expect(executions.lastCheckpointId.name).toBe('last_checkpoint_id');
    expect(toolInvocations.semanticToolCallKey.name).toBe('semantic_tool_call_key');

    for (const column of [
      'reclaimed_at',
      'reclaim_count',
      'lease_owner',
      'lease_token',
      'attempt',
      'last_checkpoint_id',
      'semantic_tool_call_key',
    ]) {
      expect(migration).toContain(column);
    }
  });
});
