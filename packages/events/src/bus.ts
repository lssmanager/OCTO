import type { OctoEvent, OctoEventType } from '@octo/contracts';

export type EventHandler<T = unknown> = (event: OctoEvent<T>) => void | Promise<void>;

export interface IEventBus {
  publish<T>(event: OctoEvent<T>): Promise<void>;
  subscribe<T>(type: OctoEventType, handler: EventHandler<T>): void;
  unsubscribe(type: OctoEventType, handler: EventHandler): void;
}
