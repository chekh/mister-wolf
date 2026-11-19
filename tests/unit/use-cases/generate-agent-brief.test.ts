import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateAgentBrief } from '../../../src/app/use-cases/generate-agent-brief.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { HeuristicProjectScanner } from '../../../src/adapters/fs/heuristic-project-scanner.js';
import { learningSignalRevision } from '../../../src/domain/learning-signals.js';
import type { MicroNoteSuppressionRecord } from '../../../src/ports/micro-note-delivery-log.port.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import type { ProjectSnapshot } from '../../../src/domain/schemas/project-scan-schema.js';

/** Валидный объект для посева фикстуры перф-теста (T013). */
function fixtureObject(
  id: string,
  overrides: (Partial<MemoryObject> & Record<string, unknown>) & Pick<MemoryObject, 'type'>
): MemoryObject {
  return {
    title: `Fixture ${id}`,
    body: `Body of ${id}.`,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: new Date(
      Date.parse('2026-09-01T00:00:00Z') + (Number.isFinite(Number(id.slice(-6))) ? Number(id.slice(-6)) : 0) * 1000
    ).toISOString(),
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    ...overrides,
    id,
  } as MemoryObject;
}

describe('generateAgentBrief', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-brief-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a brief markdown file from a scan and memory', async () => {
    const store = new MarkdownMemoryStore(dir);
    const fs = new FsFileSystem();
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const log = new JsonlEventLog(eventsPath(dir));

    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'brief-test', description: 'A test project' }),
      'utf-8'
    );
    writeFileSync(
      join(dir, 'README.md'),
      '# Brief Test\n\nThis project tests brief generation.\n\nSecond paragraph here.',
      'utf-8'
    );
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {}', 'utf-8');

    const scanner = new HeuristicProjectScanner(fs);
    const snapshot = await scanner.scan(dir);

    const decision = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'decision',
        title: 'Use TypeScript',
        body: 'Strict TypeScript everywhere.',
        createdBy: 'user:test',
      }
    );

    const question = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'note', // wave13-a: open-question → note+facet context (§5.4)
        facet: 'context',
        status: 'open', // семантика вопроса в brief: note+context+open
        title: 'Auth strategy',
        body: 'Should we use JWT or sessions?',
        createdBy: 'user:test',
      }
    );

    // wave13-a/2.13 §5.4: blocker → note+facet pitfall (create-blocker умер в P222)
    const blocker = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'note',
        facet: 'pitfall',
        title: 'Missing OAuth provider',
        createdBy: 'user:test',
      }
    );

    const { content, path, injectedIds } = await generateAgentBrief({ store, fs, clock }, dir, snapshot);

    // P2 D1: injectedIds — id объектов всех трёх секций брифа
    expect(injectedIds).toEqual([decision.object.id, question.object.id, blocker.object.id]);

    expect(path).toBe(join(dir, '.wolf', 'memory', 'briefs', 'agent-brief-latest.md'));
    expect(content).toContain('# Agent Brief: brief-test');
    expect(content).toContain('## Project Snapshot');
    expect(content).toContain('## What This Project Is');
    expect(content).toContain('This project tests brief generation.');
    expect(content).toContain('## Technology Stack');
    expect(content).toContain('## Key Files & Entry Points');
    expect(content).toContain('## Architecture Notes');
    expect(content).toContain('## Active Memory');
    expect(content).toContain('Use TypeScript');
    expect(content).toContain('## Open Questions');
    expect(content).toContain('Auth strategy');
    expect(content).toContain('## Blockers');
    expect(content).toContain('Missing OAuth provider');

    expect(content.match(/Auth strategy/g)).toHaveLength(1);
    expect(content.match(/Missing OAuth provider/g)).toHaveLength(1);

    expect(content).toContain('## Sources');
    expect(content).toContain('## Limitations');
    expect(content).toContain('## Recommended First Steps');

    const written = readFileSync(path, 'utf-8');
    expect(written).toBe(content);
  });

  it('P2 D1: пустая память → injectedIds пуст', async () => {
    const store = new MarkdownMemoryStore(dir);
    const fs = new FsFileSystem();
    const clock = new SystemClock();

    const scanner = new HeuristicProjectScanner(fs);
    const snapshot = await scanner.scan(dir);

    const { injectedIds } = await generateAgentBrief({ store, fs, clock }, dir, snapshot);
    expect(injectedIds).toEqual([]);
  });

  it('T013: p90 < 1000 мс на фикстуре 250+ объектов (parse-кэш стора)', async () => {
    const store = new MarkdownMemoryStore(dir);
    const fs = new FsFileSystem();
    const clock = new SystemClock();

    // Фикстура 250+ объектов, разные типы/статусы — чтобы фильтры секций работали:
    // decision+lesson accepted/active, open-question open, blocker active, superseded.
    const total = 260;
    for (let i = 0; i < total; i++) {
      const id = `mem_p${String(i).padStart(6, '0')}`;
      const kind = i % 5;
      if (kind === 0) {
        await store.save(fixtureObject(id, { type: 'decision' }));
      } else if (kind === 1) {
        await store.save(fixtureObject(id, { type: 'lesson' }));
      } else if (kind === 2) {
        await store.save(fixtureObject(id, { type: 'note', facet: 'context', status: 'open' })); // wave13-a: open-question
      } else if (kind === 3) {
        await store.save(
          fixtureObject(id, { type: 'note', facet: 'pitfall', impact: 'Blocks something.', status: 'active' })
        ); // wave13-a: blocker
      } else {
        await store.save(fixtureObject(id, { type: 'decision', status: 'superseded' }));
      }
    }
    expect((await store.list()).length).toBeGreaterThanOrEqual(250);

    // fake scanner-снапшот: минимальный валидный
    const snapshot: ProjectSnapshot = {
      projectName: 'perf-test',
      root: '.',
      generatedAt: '2026-09-28T00:00:00.000Z',
      summary: {
        languages: ['ts'],
        entryPoints: ['src/index.ts'],
        configFiles: ['package.json'],
        dependencies: ['vitest'],
        topLevelDirectories: ['src'],
        fileCount: 1,
      },
      files: [{ path: 'src/index.ts', extension: 'ts', size: 20 }],
      docs: [],
    };

    // ≥20 итераций на одном deps-наборе; холодная первая итерация поглощается p90
    const durations: number[] = [];
    let last: Awaited<ReturnType<typeof generateAgentBrief>> | null = null;
    for (let i = 0; i < 25; i++) {
      const t0 = performance.now();
      last = await generateAgentBrief({ store, fs, clock }, dir, snapshot);
      durations.push(performance.now() - t0);
    }
    durations.sort((a, b) => a - b);
    const p90 = durations[Math.floor(0.9 * (durations.length - 1))];
    // eslint-disable-next-line no-console
    console.log(
      `[T013 perf] n=${durations.length} p90=${p90.toFixed(1)}ms max=${durations[durations.length - 1].toFixed(1)}ms`
    );
    expect(p90).toBeLessThan(1000);

    expect(last).not.toBeNull();
    expect(last!.content).toContain('Agent Brief:');
    expect(last!.content).toContain('## Active Memory');
    expect(last!.content).toContain('## Open Questions');
    expect(last!.content).toContain('## Blockers');
    expect(last!.injectedIds.length).toBeGreaterThan(0);
  }, 30_000);

  // --- REQ-321-2 (R-2, patch 3.2.1): единая политика допуска в секциях брифа ---

  /** Минимальный валидный снапшот (как в T013) — секции памяти рендерятся отдельно. */
  function fakeSnapshot(): ProjectSnapshot {
    return {
      projectName: 'admission-test',
      root: '.',
      generatedAt: '2026-11-18T00:00:00.000Z',
      summary: {
        languages: ['ts'],
        entryPoints: ['src/index.ts'],
        configFiles: ['package.json'],
        dependencies: ['vitest'],
        topLevelDirectories: ['src'],
        fileCount: 1,
      },
      files: [{ path: 'src/index.ts', extension: 'ts', size: 20 }],
      docs: [],
    };
  }

  function openSuppression(id: string, obj: MemoryObject): MicroNoteSuppressionRecord {
    return {
      suppression_id: `cnr_test_${id}`,
      memory_id: id,
      revision: learningSignalRevision(obj),
      reason: 'observed contradiction',
      note_evidence: `${id}`,
      contradiction_evidence: 'observed behavior contradicts the record',
      suppressed_at: '2026-11-16T00:00:00.000Z',
      resolved_at: null,
      resolution: null,
    };
  }

  function noteLogStub(suppressions: () => MicroNoteSuppressionRecord[]) {
    return {
      recordDelivery: () => {},
      // REQ-333-7 (ADR-340-6): порт дополнен батчем; фейк принимает батч (тот же контракт)
      recordDeliveries: (
        _records: Array<{ memory_id: string; revision: string; channel: string; kind: string; ts: string }>
      ) => {},
      recordSuppression: () => {},
      resolveSuppression: () => {},
      suppressions,
      deliveries: () => [],
      setObservation: () => {},
      observations: () => [],
    };
  }

  describe('generateAgentBrief admission policy (REQ-321-2)', () => {
    let dir: string;
    let fs: FsFileSystem;
    let clock: SystemClock;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'wolf-brief-adm-'));
      fs = new FsFileSystem();
      clock = new SystemClock();
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    function activeMemorySection(content: string): string {
      return content.split('## Active Memory')[1]!.split('## ')[0]!;
    }

    it('AC-2.1: micro-note объекты не попадают в legacy-секции; доставляет только селектор', async () => {
      const store = new MarkdownMemoryStore(dir);
      await store.save(fixtureObject('rule_mn', { type: 'rule', tags: ['micro-note'], title: 'Micro tagged rule' }));
      await store.save(fixtureObject('rule_plain', { type: 'rule', title: 'Plain accepted rule' }));
      await store.save(
        fixtureObject('block_mn', {
          type: 'note',
          facet: 'pitfall',
          tags: ['micro-note'],
          title: 'Micro tagged blocker',
        })
      );

      const r = await generateAgentBrief({ store, fs, clock }, dir, fakeSnapshot(), {
        microNotes: { context: { environment: 'darwin' } },
      });

      const activeMemory = activeMemorySection(r.content);
      expect(activeMemory).toContain('Plain accepted rule'); // позитивный контроль
      expect(activeMemory).not.toContain('Micro tagged rule'); // RED: сегодня попадает
      const blockersSection = r.content.split('## Blockers')[1]!.split('## ')[0]!;
      expect(blockersSection).not.toContain('Micro tagged blocker'); // RED: сегодня попадает
      expect(r.microNotes?.delivered.map((c) => c.id)).toEqual(['block_mn', 'rule_mn']); // id asc
      expect(r.content).toContain('## Local Micro-Notes');
    });

    it('AC-2.2: micro-note правило applies:[darwin] отсутствует в брифе при linux', async () => {
      const store = new MarkdownMemoryStore(dir);
      await store.save(
        fixtureObject('rule_darwin', {
          type: 'rule',
          tags: ['micro-note'],
          applies: { environments: ['darwin'] },
          title: 'Darwin brief rule',
        })
      );

      const r = await generateAgentBrief({ store, fs, clock }, dir, fakeSnapshot(), {
        microNotes: { context: { environment: 'linux' } },
      });

      expect(r.content).not.toContain('Darwin brief rule'); // RED: сегодня в Active Memory
      expect(r.microNotes?.delivered ?? []).toEqual([]);
    });

    it('AC-2.3: подавленный открытым противоречием объект отсутствует в секциях брифа', async () => {
      const store = new MarkdownMemoryStore(dir);
      const rule = fixtureObject('rule_sup_brief', { type: 'rule', title: 'Suppressed brief rule' });
      await store.save(rule);
      const noteLog = noteLogStub(() => [openSuppression('rule_sup_brief', rule)]);

      const r = await generateAgentBrief({ store, fs, clock, noteLog }, dir, fakeSnapshot(), { microNotes: {} });
      expect(r.content).not.toContain('Suppressed brief rule'); // RED: сегодня в Active Memory

      // разрешение противоречия → объект снова в Active Memory
      const resolved = await generateAgentBrief(
        { store, fs, clock, noteLog: noteLogStub(() => []) },
        dir,
        fakeSnapshot(),
        { microNotes: {} }
      );
      expect(resolved.content).toContain('Suppressed brief rule');
    });

    it('AC-2.4: accepted-объект со scope чужого worktree не доставляется в main-виде брифа', async () => {
      const store = new MarkdownMemoryStore(dir);
      await store.save(
        fixtureObject('rule_wt', { type: 'rule', scope: 'worktree:w-fedcba987654', title: 'Foreign worktree rule' })
      );
      await store.save(fixtureObject('rule_main', { type: 'rule', scope: 'project', title: 'Main rule' }));

      const r = await generateAgentBrief({ store, fs, clock }, dir, fakeSnapshot());
      const activeMemory = activeMemorySection(r.content);
      expect(activeMemory).toContain('Main rule'); // позитивный контроль
      expect(activeMemory).not.toContain('Foreign worktree rule'); // RED: сегодня содержится
    });

    it('AC-2.5: подавленное micro-note отсутствует в выводе, underReview репортит id', async () => {
      const store = new MarkdownMemoryStore(dir);
      const rule = fixtureObject('rule_mn_sup_b', {
        type: 'rule',
        tags: ['micro-note'],
        title: 'Suppressed micro brief',
      });
      await store.save(rule);
      const noteLog = noteLogStub(() => [openSuppression('rule_mn_sup_b', rule)]);

      const r = await generateAgentBrief({ store, fs, clock, noteLog }, dir, fakeSnapshot(), { microNotes: {} });
      expect(r.content).not.toContain('Suppressed micro brief'); // RED: сегодня в Active Memory
      expect(r.microNotes?.underReview.map((u) => u.id)).toEqual(['rule_mn_sup_b']);
    });
  });
});
