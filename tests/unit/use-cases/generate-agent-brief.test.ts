import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateAgentBrief } from '../../../src/app/use-cases/generate-agent-brief.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { createBlocker } from '../../../src/app/use-cases/create-blocker.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { HeuristicProjectScanner } from '../../../src/adapters/fs/heuristic-project-scanner.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import type { ProjectSnapshot } from '../../../src/domain/schemas/project-scan-schema.js';

/** Валидный объект для посева фикстуры перф-теста (T013). */
function fixtureObject(id: string, overrides: Partial<MemoryObject> & Pick<MemoryObject, 'type'>): MemoryObject {
  return {
    title: `Fixture ${id}`,
    body: `Body of ${id}.`,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: new Date(Date.parse('2026-09-01T00:00:00Z') + Number(id.slice(-6)) * 1000).toISOString(),
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
        type: 'open-question',
        title: 'Auth strategy',
        body: 'Should we use JWT or sessions?',
        createdBy: 'user:test',
      }
    );

    const blocker = await createBlocker(
      { store, log, clock, idGen },
      {
        title: 'Missing OAuth provider',
        impact: 'No OAuth provider selected yet.',
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
        await store.save(fixtureObject(id, { type: 'open-question', status: 'open' }));
      } else if (kind === 3) {
        await store.save(fixtureObject(id, { type: 'blocker', impact: 'Blocks something.', status: 'active' }));
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
  });
});
