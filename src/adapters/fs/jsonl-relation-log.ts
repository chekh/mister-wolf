import * as fs from 'fs/promises';
import { dirname, basename } from 'path';
import { RelationLog } from '../../ports/relation-log.port.js';
import { Relation, RelationSchema } from '../../domain/schemas/relation-schema.js';
import { scanJsonlFile } from './jsonl-scan.js';

export class JsonlRelationLog implements RelationLog {
  constructor(private path: string) {}

  async append(relation: Relation): Promise<void> {
    const validated = RelationSchema.parse(relation);
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.appendFile(this.path, JSON.stringify(validated) + '\n', 'utf-8');
  }

  async list(filters?: { subject?: string; object?: string; predicate?: string }): Promise<Relation[]> {
    const { items, problems } = await scanJsonlFile<Relation>(this.path, (line, lineNum) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid JSON at line ${lineNum}: ${cause}`);
      }
      try {
        return RelationSchema.parse(parsed);
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        throw new Error(`Relation schema validation failed at line ${lineNum}: ${cause}`);
      }
    });
    for (const p of problems) {
      console.error(`[mr-wolf] skipping bad line ${p.line} in ${basename(this.path)}: ${p.error}`);
    }
    // Компенсации §6.4 (прецедент событий — replay last-write-wins): запись
    // removed: true гасит ребро-тройку (subject, predicate, object); повторный
    // add после remove дописывает новую запись и оживляет ребро.
    const lastByTriple = new Map<string, Relation>();
    for (const r of items) {
      lastByTriple.set(`${r.subject}\0${r.predicate}\0${r.object}`, r);
    }
    const live = [...lastByTriple.values()].filter((r) => r.removed !== true);
    if (!filters) return live;
    return live.filter(
      (r) =>
        (!filters.subject || r.subject === filters.subject) &&
        (!filters.object || r.object === filters.object) &&
        (!filters.predicate || r.predicate === filters.predicate)
    );
  }
}
