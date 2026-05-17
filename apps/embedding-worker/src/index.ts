/**
 * @octo/embedding-worker
 * Vector embedding pipeline — BullMQ worker
 * Full implementation: F2 milestone
 */
export const WORKER_NAME = 'embedding-worker' as const;
export const WORKER_VERSION = '0.0.1' as const;

export type EmbeddingWorkerStatus = 'idle' | 'running' | 'stopped';

export interface EmbeddingJobPayload {
  readonly documentId: string;
  readonly content: string;
  readonly model: string;
}
