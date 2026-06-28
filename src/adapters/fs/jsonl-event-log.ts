import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { EventLog } from '../../ports/event-log.port.js';
import { MemoryEvent, MemoryEventSchema } from '../../domain/schemas/memory-event-schema.js';

export class JsonlEventLog implements EventLog {
  constructor(private path: string) {}

  async append(event: MemoryEvent): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true });
    const validated = MemoryEventSchema.parse(event);
    appendFileSync(this.path, JSON.stringify(validated) + '\n', 'utf-8');
  }

  async readAll(): Promise<MemoryEvent[]> {
    if (!existsSync(this.path)) return [];
    const content = readFileSync(this.path, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    return lines.map((line) => MemoryEventSchema.parse(JSON.parse(line)));
  }
}
