import { z } from 'zod';

const VersionValueSchema = z.union([z.number(), z.string()]);

export const CheckpointSourceSchema = z.enum(['input', 'loop', 'tool', 'approval', 'reclaim', 'final']);

export const ExecutionCheckpointSchema = z.object({
  id: z.string(),
  executionId: z.string(),
  tenantId: z.string(),
  stepIndex: z.number().int(),
  source: CheckpointSourceSchema,
  parentCheckpointId: z.string().nullable().optional(),
  stateJson: z.record(z.unknown()),
  channelVersions: z.record(VersionValueSchema),
  versionsSeen: z.record(z.record(VersionValueSchema)),
  metadataJson: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});

export const CheckpointWriteSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  checkpointId: z.string(),
  taskId: z.string(),
  taskPath: z.string(),
  writeIndex: z.number().int(),
  channel: z.string(),
  type: z.string().optional(),
  valueJson: z.unknown(),
});

export type CheckpointSource = z.infer<typeof CheckpointSourceSchema>;
export type ExecutionCheckpoint = z.infer<typeof ExecutionCheckpointSchema>;
export type CheckpointWrite = z.infer<typeof CheckpointWriteSchema>;
