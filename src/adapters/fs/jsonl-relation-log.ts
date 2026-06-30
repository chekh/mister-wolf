import * as fs from 'fs/promises';
import { dirname } from 'path';
import { RelationLog } from '../../ports/relation-log.port.js';
import { Relation, RelationSchema } from '../../domain/schemas/relation-schema.js';

export class JsonlRelationLog implements RelationLog {
  constructor(private path: string) {}

  async append(relation: Relation): Promise<void> {
    const validated = RelationSchema.parse(relation);
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.appendFile(this.path, JSON.stringify(validated) + '\n', 'utf-8');
  }

  async list(filters?: { subject?: string; object?: string; predicate?: string }): Promise<Relation[]> {
    let content: string;
    try {
      content = await fs.readFile(this.path, 'utf-8');
    } catch (err) {
      if (isEnoent(err)) return [];
      throw err;
    }
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const relations = lines.map((line, index) => parseRelationLine(line, index + 1));
    if (!filters) return relations;
    return relations.filter(
      (r) =>
        (!filters.subject || r.subject === filters.subject) &&
        (!filters.object || r.object === filters.object) &&
        (!filters.predicate || r.predicate === filters.predicate)
    );
  }
}

function parseRelationLine(line: string, lineNumber: number): Relation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON at line ${lineNumber} of relation log: ${cause}\nLine content: ${line}`);
  }
  try {
    return RelationSchema.parse(parsed);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Relation schema validation failed at line ${lineNumber} of relation log: ${cause}\nLine content: ${line}`
    );
  }
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'ENOENT';
}
