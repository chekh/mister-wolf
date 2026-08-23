import * as fs from 'fs/promises';
import { dirname, basename } from 'path';
import { EventLog } from '../../ports/event-log.port.js';
import { MemoryEvent, MemoryEventSchema } from '../../domain/schemas/memory-event-schema.js';
import { scanJsonlFile } from './jsonl-scan.js';

export class JsonlEventLog implements EventLog {
  constructor(private path: string) {}

  async append(event: MemoryEvent): Promise<void> {
    const validated = MemoryEventSchema.parse(event);
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.appendFile(this.path, JSON.stringify(validated) + '\n', 'utf-8');
  }

  async readAll(): Promise<MemoryEvent[]> {
    const { items, problems } = await scanJsonlFile<MemoryEvent>(this.path, (line, lineNum) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid JSON at line ${lineNum}: ${cause}`);
      }
      try {
        return MemoryEventSchema.parse(parsed);
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        throw new Error(`Event schema validation failed at line ${lineNum}: ${cause}`);
      }
    });
    for (const p of problems) {
      console.error(`[mr-wolf] skipping bad line ${p.line} in ${basename(this.path)}: ${p.error}`);
    }
    return items;
  }
}
