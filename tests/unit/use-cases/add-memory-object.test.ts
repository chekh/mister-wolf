import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('addMemoryObject', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-add-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves a lesson and appends an event', async () => {
    const result = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Router reconnect failure mode',
        body: 'We found...',
        createdBy: 'user:chekh',
        tags: ['router'],
      }
    );

    expect(result.object.id).toMatch(/^mem_/);
    const loaded = await store.get(result.object.id);
    expect(loaded).not.toBeNull();

    const events = await log.readAll();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('memory.added');
  });

  it('creates typed object with extra fields validated by declaration', async () => {
    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'complaint',
        title: 'Flaky test',
        createdBy: 'user:test',
        extra: { about: 'ci', rule: 'no flakes', evidence: 'log', proposal: 'quarantine' },
      }
    );
    expect(object.about).toBe('ci');
    expect(object.rule).toBe('no flakes');
  });

  it('rejects unknown extra field', async () => {
    await expect(
      addMemoryObject(
        { store, log, clock, idGen },
        { type: 'lesson', title: 'Bad', createdBy: 'user:test', extra: { nonsense: 'x' } }
      )
    ).rejects.toThrow(/nonsense/);
  });

  // T011: читаемые сообщения об ошибках валидации
  it('rejects unknown type with UserFacingError listing valid types', async () => {
    await expect(
      addMemoryObject({ store, log, clock, idGen }, { type: 'notaftype' as never, title: 'X', createdBy: 'u:test' })
    ).rejects.toThrow(
      /Unknown memory type "notaftype"\. Valid types: rule, lesson, decision, thread, complaint, tool, note/
    );
  });

  it('rejects old type with the 2.13 removal hint', async () => {
    await expect(
      addMemoryObject({ store, log, clock, idGen }, { type: 'observation' as never, title: 'X', createdBy: 'u:test' })
    ).rejects.toThrow(/Type "observation" was removed in 2\.13: use "note" \(facet: legacy\)/);
  });

  it('rejects unknown field with the type’s valid fields list', async () => {
    await expect(
      addMemoryObject(
        { store, log, clock, idGen },
        { type: 'lesson', title: 'Bad', createdBy: 'user:test', extra: { scope: 'x' } }
      )
    ).rejects.toThrow(/Unknown field "scope".*valid fields.*trigger_keywords/);
  });

  it('rejects missing declared field at creation', async () => {
    await expect(
      addMemoryObject({ store, log, clock, idGen }, { type: 'thread', title: 'No goal', createdBy: 'user:test' })
    ).rejects.toThrow(/goal/i);
  });

  it('defaults status to the declaration defaultStatus (complaint open, tool candidate)', async () => {
    const complaint = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'complaint',
        title: 'c',
        createdBy: 'user:test',
        extra: { about: 'a', rule: 'r', evidence: 'e', proposal: 'p' },
      }
    );
    expect(complaint.object.status).toBe('open');

    const tool = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'tool',
        title: 't',
        createdBy: 'user:test',
        extra: { name: 'n', script_path: 'p.sh', language: 'bash' },
      }
    );
    expect(tool.object.status).toBe('candidate');
  });

  it('decision still defaults to active', async () => {
    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'decision', title: 'Use SQLite', createdBy: 'user:test' }
    );
    expect(object.status).toBe('active');
  });

  it('explicit status still wins over the lifecycle default', async () => {
    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'complaint',
        title: 't',
        createdBy: 'user:test',
        status: 'rejected',
        extra: { about: 'a', rule: 'r', evidence: 'e', proposal: 'p' },
      }
    );
    expect(object.status).toBe('rejected');
  });

  it('add --type thread создаёт threads/<id>/WORK-THREAD.md (§10.1)', async () => {
    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'thread', title: 'Wave 2.13', createdBy: 'user:test', extra: { goal: 'ship' } }
    );
    const { existsSync } = await import('fs');
    expect(existsSync(join(dir, '.wolf/memory/threads', object.id, 'WORK-THREAD.md'))).toBe(true);
  });
});

// 2.13 §5.3: фасетная валидация в домене
describe('addMemoryObject facet validation (note)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-add-facet-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('note без facet → ошибка называет допустимые значения', async () => {
    await expect(
      addMemoryObject({ store, log, clock, idGen }, { type: 'note', title: 'N', createdBy: 'u:test' })
    ).rejects.toThrow(
      /facet is required for type "note" \(valid values: howto, pitfall, context, metric, history, legacy, constraint\)/
    );
  });

  it('free-form facet → та же ошибка со списком', async () => {
    await expect(
      addMemoryObject({ store, log, clock, idGen }, { type: 'note', title: 'N', createdBy: 'u:test', facet: 'mood' })
    ).rejects.toThrow(
      /Invalid facet "mood" for type "note" \(valid values: howto, pitfall, context, metric, history, legacy, constraint\)/
    );
  });

  it('facet на не-note → ошибка «facet only valid for note»', async () => {
    await expect(
      addMemoryObject(
        { store, log, clock, idGen },
        { type: 'lesson', title: 'L', createdBy: 'u:test', facet: 'pitfall' }
      )
    ).rejects.toThrow(/facet is only valid for type "note" \(got type "lesson"\)/);
  });

  it('валидный facet проходит и пишется в frontmatter', async () => {
    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'note', title: 'N', createdBy: 'u:test', facet: 'pitfall' }
    );
    expect(object.facet).toBe('pitfall');
    const loaded = await store.get(object.id);
    expect(loaded?.facet).toBe('pitfall');
  });

  it('кастомный словарь facetCharacter из конфига валидирует выбор', async () => {
    const custom = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
    const { object } = await addMemoryObject(
      { store, log, clock, idGen, facetCharacter: custom },
      { type: 'note', title: 'N', createdBy: 'u:test', facet: 'theta' }
    );
    expect(object.facet).toBe('theta');
    await expect(
      addMemoryObject(
        { store, log, clock, idGen, facetCharacter: custom },
        { type: 'note', title: 'N', createdBy: 'u:test', facet: 'pitfall' }
      )
    ).rejects.toThrow(/Invalid facet "pitfall".*valid values: alpha, beta, gamma/);
  });

  it('facet через --set (extra) тоже валидируется', async () => {
    await expect(
      addMemoryObject(
        { store, log, clock, idGen },
        { type: 'note', title: 'N', createdBy: 'u:test', extra: { facet: 'nope' } }
      )
    ).rejects.toThrow(/Invalid facet "nope"/);
  });
});
