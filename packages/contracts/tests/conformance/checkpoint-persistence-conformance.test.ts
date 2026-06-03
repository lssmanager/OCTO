import { describe, expect, it } from 'vitest';
import { CheckpointWriteSchema, ExecutionCheckpointSchema } from '../../src/zod';
import { CONTRACT_CASES } from '../utils/conformance-fixtures';
import { validateWithPython } from '../utils/python-contract-bridge';

type Checkpoint = typeof CONTRACT_CASES.ExecutionCheckpointSchema.minimum;
type CheckpointWrite = typeof CONTRACT_CASES.CheckpointWriteSchema.minimum;

class InMemoryCheckpointPayloadStore {
  private readonly checkpoints = new Map<string, Checkpoint>();
  private readonly writes = new Map<string, CheckpointWrite[]>();

  put(checkpoint: Checkpoint): Checkpoint {
    const parsed = ExecutionCheckpointSchema.parse(checkpoint) as Checkpoint;
    validateWithPython('ExecutionCheckpointSchema', parsed);
    this.checkpoints.set(String(parsed.id), parsed);
    return parsed;
  }

  get(executionId: string, stepIndex: number): Checkpoint | undefined {
    return [...this.checkpoints.values()].find(
      (checkpoint) => checkpoint.executionId === executionId && checkpoint.stepIndex === stepIndex
    );
  }

  putWrites(writes: CheckpointWrite[]): CheckpointWrite[] {
    const parsedWrites = writes.map((write) => {
      const parsed = CheckpointWriteSchema.parse(write) as CheckpointWrite;
      validateWithPython('CheckpointWriteSchema', parsed);
      return parsed;
    });

    for (const write of parsedWrites) {
      const checkpointWrites = this.writes.get(String(write.checkpointId)) ?? [];
      checkpointWrites.push(write);
      checkpointWrites.sort((left, right) => Number(left.writeIndex) - Number(right.writeIndex));
      this.writes.set(String(write.checkpointId), checkpointWrites);
    }

    return parsedWrites;
  }

  list(executionId: string): Checkpoint[] {
    return [...this.checkpoints.values()]
      .filter((checkpoint) => checkpoint.executionId === executionId)
      .sort((left, right) => Number(left.stepIndex) - Number(right.stepIndex));
  }

  lineage(checkpointId: string): Checkpoint[] {
    const lineage: Checkpoint[] = [];
    let current = this.checkpoints.get(checkpointId);

    while (current) {
      lineage.unshift(current);
      const parentId = current.parentCheckpointId;
      current = typeof parentId === 'string' ? this.checkpoints.get(parentId) : undefined;
    }

    return lineage;
  }

  writesFor(checkpointId: string): CheckpointWrite[] {
    return this.writes.get(checkpointId) ?? [];
  }
}

describe('ExecutionCheckpoint persistence payload conformance', () => {
  it('covers put/get/putWrites/list/lineage ordering without external infrastructure', () => {
    const store = new InMemoryCheckpointPayloadStore();
    const root = store.put(CONTRACT_CASES.ExecutionCheckpointSchema.minimum as Checkpoint);
    const child = store.put({
      ...CONTRACT_CASES.ExecutionCheckpointSchema.maximum,
      parentCheckpointId: root.id,
      stepIndex: 2,
    } as Checkpoint);
    const middle = store.put({
      ...CONTRACT_CASES.ExecutionCheckpointSchema.nullable,
      id: 'cp_middle',
      parentCheckpointId: root.id,
      stepIndex: 1,
    } as Checkpoint);

    store.putWrites([
      { ...CONTRACT_CASES.CheckpointWriteSchema.maximum, checkpointId: child.id, writeIndex: 1 },
      { ...CONTRACT_CASES.CheckpointWriteSchema.minimum, checkpointId: child.id, writeIndex: 0 },
    ] as CheckpointWrite[]);

    expect(store.get(String(root.executionId), 1)?.id).toBe(middle.id);
    expect(store.list(String(root.executionId)).map((checkpoint) => checkpoint.id)).toEqual([
      root.id,
      middle.id,
      child.id,
    ]);
    expect(store.lineage(String(child.id)).map((checkpoint) => checkpoint.id)).toEqual([
      root.id,
      child.id,
    ]);
    expect(store.writesFor(String(child.id)).map((write) => write.writeIndex)).toEqual([0, 1]);
  });
});
