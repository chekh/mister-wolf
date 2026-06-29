import * as fs from 'fs/promises';
import { dirname } from 'path';
import { EventLog } from '../../ports/event-log.port.js';
import { MemoryEvent, MemoryEventSchema } from '../../domain/schemas/memory-event-schema.js';

export class JsonlEventLog implements EventLog {
  constructor(private path: string) {}

  async append(event: MemoryEvent): Promise<void> {
    const validated = MemoryEventSchema.parse(event);
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.appendFile(this.path, JSON.stringify(validated) + '\n', 'utf-8');
  }

  async readAll(): Promise<MemoryEvent[]> {
    let content: string;
    try {
      content = await fs.readFile(this.path, 'utf-8');
    } catch (err) {
      if (isEnoent(err)) return [];
      throw err;
    }
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    return lines.map((line, index) => parseEventLine(line, index + 1));
  }
}

function parseEventLine(line: string, lineNumber: number): MemoryEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON at line ${lineNumber} of event log: ${cause}\nLine content: ${line}`);
  }
  try {
    return MemoryEventSchema.parse(parsed);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Event schema validation failed at line ${lineNumber} of event log: ${cause}\nLine content: ${line}`
    );
  }
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'ENOENT';
}
