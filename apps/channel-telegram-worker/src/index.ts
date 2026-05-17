/**
 * @octo/channel-telegram-worker
 * Telegram channel adapter — BullMQ worker
 * Full implementation: F1 milestone
 */
export const WORKER_NAME = 'channel-telegram-worker' as const;
export const WORKER_VERSION = '0.0.1' as const;

export type TelegramWorkerStatus = 'idle' | 'running' | 'stopped';
