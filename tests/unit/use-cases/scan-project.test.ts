import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanProject } from '../../../src/app/use-cases/scan-project.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { HeuristicProjectScanner } from '../../../src/adapters/fs/heuristic-project-scanner.js';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('scanProject', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'wolf-scan-'));
    mkdirSync(join(projectDir, 'src'), { recursive: true });
    mkdirSync(join(projectDir, 'docs'), { recursive: true });
    writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: 'demo-project', version: '1.0.0' }));
    writeFileSync(join(projectDir, 'src', 'index.ts'), 'console.log("hello");');
    writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide\n\nContent.');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('saves a project scan memory object and appends an event', async () => {
    const store = new MarkdownMemoryStore(projectDir);
    const log = new JsonlEventLog(eventsPath(projectDir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const scanner = new HeuristicProjectScanner(new FsFileSystem());

    const result = await scanProject({ store, log, clock, idGen, scanner }, projectDir);

    expect(result.object.id).toBe('project-scan-latest');
    expect(result.object.type).toBe('context');
    expect(result.object.review_state).toBe('accepted');
    expect(result.object.title).toBe('Project scan for demo-project');
    expect(result.object.body).toContain('## Repository');

    const loaded = await store.get('project-scan-latest');
    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe('context');

    const events = await log.readAll();
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('memory.added');
    expect(events[0].payload).toMatchObject({
      memory_id: 'project-scan-latest',
      type: 'context',
    });
    expect(events[1].payload).toMatchObject({ type: 'document-ref' });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].type).toBe('document-ref');
    expect(result.documents[0].source.path).toBe('docs/guide.md');
    const loadedDoc = await store.get(result.documents[0].id);
    expect(loadedDoc?.type).toBe('document-ref');
  });
});
