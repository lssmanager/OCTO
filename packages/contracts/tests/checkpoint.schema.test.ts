import { describe, expect, it } from 'vitest';
import { ExecutionCheckpointSchema, CheckpointWriteSchema } from '../src/zod';

describe('ExecutionCheckpointSchema', () => {
  const base = {
    id: 'cp_1', executionId: 'exec_1', tenantId: 'tenant_1', stepIndex: 1, source: 'tool',
    stateJson: { ok: true }, channelVersions: { c1: 1, c2: '2' }, versionsSeen: { a: { b: 1 } }, metadataJson: {}, createdAt: '2026-05-23T10:00:00Z',
  };
  it('accepts valid checkpoint', () => expect(() => ExecutionCheckpointSchema.parse(base)).not.toThrow());
  it('rejects invalid checkpoint source', () => expect(() => ExecutionCheckpointSchema.parse({ ...base, source: 'runtime' })).toThrow());
  it('rejects invalid channelVersions values', () => expect(() => ExecutionCheckpointSchema.parse({ ...base, channelVersions: { c1: true } })).toThrow());
  it('rejects invalid versionsSeen structure', () => expect(() => ExecutionCheckpointSchema.parse({ ...base, versionsSeen: { a: 123 } })).toThrow());
});

describe('CheckpointWriteSchema', () => {
  const base = { id: 'cw_1', tenantId: 'tenant_1', checkpointId: 'cp_1', taskId: 't1', taskPath: 'root.task', writeIndex: 0, channel: 'messages', valueJson: { anything: ['goes'] } };
  it('accepts arbitrary valueJson', () => expect(() => CheckpointWriteSchema.parse({ ...base, valueJson: [1, 'x', { y: true }] })).not.toThrow());
  it('rejects non-integer writeIndex', () => expect(() => CheckpointWriteSchema.parse({ ...base, writeIndex: 0.1 })).toThrow());
  it('accepts optional type', () => expect(() => CheckpointWriteSchema.parse({ ...base, type: 'append' })).not.toThrow());
});
