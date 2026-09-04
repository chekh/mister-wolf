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
});
