/**
 * @octo/channel-discord-worker
 * Discord channel adapter — BullMQ worker
 * Full implementation: F1 milestone
 */
export const WORKER_NAME = 'channel-discord-worker' as const;
export const WORKER_VERSION = '0.0.1' as const;

export type DiscordWorkerStatus = 'idle' | 'running' | 'stopped';
