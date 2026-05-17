/**
 * @octo/channel-whatsapp-worker
 * WhatsApp channel adapter — BullMQ worker
 * Full implementation: F1 milestone
 */
export const WORKER_NAME = 'channel-whatsapp-worker' as const;
export const WORKER_VERSION = '0.0.1' as const;

export type WhatsAppWorkerStatus = 'idle' | 'running' | 'stopped';
