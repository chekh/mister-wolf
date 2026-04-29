import { RuntimeEvent } from '../types/events.js';

export type EventHandler = (event: RuntimeEvent) => void | Promise<void>;
export type Unsubscribe = () => void;

export interface EventBus {
  publish(event: RuntimeEvent): Promise<void>;
  subscribe(type: string, handler: EventHandler): Unsubscribe;
}

export class InProcessEventBus implements EventBus {
  private handlers = new Map<string, EventHandler[]>();

  async publish(event: RuntimeEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    for (const handler of handlers) {
      await handler(event);
    }
  }

  subscribe(type: string, handler: EventHandler): Unsubscribe {
    const existing = this.handlers.get(type) || [];
    this.handlers.set(type, [...existing, handler]);

    return () => {
      const current = this.handlers.get(type) || [];
      this.handlers.set(
        type,
        current.filter((h) => h !== handler)
      );
    };
  }
}
