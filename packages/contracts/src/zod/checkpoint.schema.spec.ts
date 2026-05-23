import { describe, expect, it } from 'vitest';
import { CheckpointWriteSchema, ExecutionCheckpointSchema } from './checkpoint.schema';

describe('ExecutionCheckpointSchema', () => {
  const valid = {
    id: 'c1', executionId: 'e1', tenantId: 't1', stepIndex: 0, source: 'tool',
    stateJson: { state: 'ok' }, channelVersions: { main: 1, audit: '2' },
    versionsSeen: { agent: { ch1: 1, ch2: '2' } }, metadataJson: { foo: 'bar' },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  it('accepts valid checkpoint', () => expect(ExecutionCheckpointSchema.parse(valid)).toBeTruthy());
  it('rejects invalid checkpoint source', () => expect(() => ExecutionCheckpointSchema.parse({ ...valid, source: 'manual' })).toThrow());
  it('rejects invalid channelVersions values', () => expect(() => ExecutionCheckpointSchema.parse({ ...valid, channelVersions: { bad: true } })).toThrow());
  it('rejects invalid versionsSeen structure', () => expect(() => ExecutionCheckpointSchema.parse({ ...valid, versionsSeen: { a: { b: { nested: 1 } } } })).toThrow());
});

describe('CheckpointWriteSchema', () => {
  const valid = { id: 'w1', tenantId: 't1', checkpointId: 'c1', taskId: 'task1', taskPath: 'root.0', writeIndex: 0, channel: 'messages', valueJson: { any: ['thing'] } };
  it('accepts arbitrary valueJson', () => expect(CheckpointWriteSchema.parse(valid)).toBeTruthy());
  it('rejects non-integer writeIndex', () => expect(() => CheckpointWriteSchema.parse({ ...valid, writeIndex: 1.5 })).toThrow());
  it('accepts optional type', () => expect(CheckpointWriteSchema.parse({ ...valid, type: 'append' })).toBeTruthy());
});
