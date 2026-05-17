/**
 * @octo/memory-worker
 * Agent memory consolidation — BullMQ worker
 * Full implementation: F2 milestone
 */
export const WORKER_NAME = 'memory-worker' as const;
export const WORKER_VERSION = '0.0.1' as const;

export type MemoryWorkerStatus = 'idle' | 'running' | 'stopped';

export interface MemoryConsolidationPayload {
  readonly agentId: string;
  readonly sessionId: string;
  readonly strategy: 'summarize' | 'compress' | 'prune';
}
