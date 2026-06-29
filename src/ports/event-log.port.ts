import { MemoryEvent } from '../domain/schemas/memory-event-schema.js';

export interface EventLog {
  append(event: MemoryEvent): Promise<void>;
  readAll(): Promise<MemoryEvent[]>;
}
