import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { FsProjectInitializer } from '../../../src/adapters/fs/fs-project-initializer.js';
import { HeuristicProjectScanner } from '../../../src/adapters/fs/heuristic-project-scanner.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { bootstrapProject } from '../../../src/app/use-cases/bootstrap-project.js';

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-dedup-'));
  writeFileSync(join(dir, 'package.json'), '{ "name": "dedup-test", "scripts": { "test": "vitest" } }');
  // bootstrapProject читает .wolf/config.yaml и бросает "not initialized" без скелета
  await new FsProjectInitializer().initialize(dir);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function deps() {
  const fs = new FsFileSystem();
  let tick = 0;
  return {
    store: new MarkdownMemoryStore(dir),
    log: new JsonlEventLog(eventsPath(dir)),
    // тикающие часы: id объектов зависят от времени; замороженный Date делал бы
    // повторы детерминированными по id и FAIL-шаг невоспроизводимым
    clock: { now: () => new Date(Date.parse('2026-08-30T00:00:00Z') + tick++ * 1000) },
    idGen: new HashIdGenerator(),
    scanner: new HeuristicProjectScanner(fs),
    fs,
  };
}

describe('bootstrapProject dedup (спека §8: дедупликация при повторе)', () => {
  it('second run does not duplicate rules or work-threads', async () => {
    const d = deps();
    const first = await bootstrapProject(d, { baseDir: dir, createdBy: 'user:test' });
    const rulesAfterFirst = await d.store.list({ type: 'rule', status: 'proposed' });
    const threadsAfterFirst = await d.store.list({ type: 'work-thread' });
    expect(rulesAfterFirst.length).toBeGreaterThan(0);
    expect(threadsAfterFirst).toHaveLength(1);

    const second = await bootstrapProject(d, { baseDir: dir, createdBy: 'user:test' });
    const rulesAfterSecond = await d.store.list({ type: 'rule', status: 'proposed' });
    const threadsAfterSecond = await d.store.list({ type: 'work-thread' });

    expect(rulesAfterSecond.length).toBe(rulesAfterFirst.length);
    expect(threadsAfterSecond).toHaveLength(1);
    expect(threadsAfterSecond[0].id).toBe(threadsAfterFirst[0].id);
    // brief второго прогона переиспользует существующий thread
    expect(second.workThreadId).toBe(first.workThreadId);
  });
});
