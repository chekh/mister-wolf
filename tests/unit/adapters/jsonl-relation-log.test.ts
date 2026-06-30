import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { relationsPath } from '../../../src/adapters/fs/project-paths.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';

describe('JsonlRelationLog', () => {
  let dir: string;
  let log: JsonlRelationLog;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-rel-'));
    log = new JsonlRelationLog(relationsPath(dir));
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends and lists relations', async () => {
    const now = new Date();
    await log.append({
      id: idGen.generateEventId(now),
      subject: 'art_1',
      predicate: 'answers',
      object: 'ireq_1',
      created_at: now.toISOString(),
      source: 'agent',
      confidence: 'high',
    });
    const all = await log.list();
    expect(all).toHaveLength(1);
    expect(all[0].subject).toBe('art_1');
  });

  it('filters relations by subject', async () => {
    const now = new Date();
    await log.append({
      id: idGen.generateEventId(now),
      subject: 'art_1',
      predicate: 'answers',
      object: 'ireq_1',
      created_at: now.toISOString(),
      source: 'agent',
      confidence: 'high',
    });
    await log.append({
      id: idGen.generateEventId(now),
      subject: 'art_2',
      predicate: 'answers',
      object: 'ireq_2',
      created_at: now.toISOString(),
      source: 'agent',
      confidence: 'high',
    });
    const filtered = await log.list({ subject: 'art_1' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].object).toBe('ireq_1');
  });
});
