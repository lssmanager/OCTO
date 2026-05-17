/**
 * @octo/queue — BullMQ queue primitives
 * Full implementation: see issue #7 (F0-006)
 */
export const QUEUE_PACKAGE_VERSION = '0.0.1' as const;

export type QueueName = string;

export interface QueueOptions {
  readonly name: QueueName;
  readonly connection: {
    readonly host: string;
    readonly port: number;
  };
}
