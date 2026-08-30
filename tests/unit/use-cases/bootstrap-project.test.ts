import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProjectMemory } from '../../../src/app/use-cases/init-project-memory.js';
import { bootstrapProject } from '../../../src/app/use-cases/bootstrap-project.js';
import { FsProjectInitializer } from '../../../src/adapters/fs/fs-project-initializer.js';
import { createCliContainer } from '../../../src/bootstrap/container.js';

describe('bootstrapProject', () => {
  let dir: string;
  let deps: ReturnType<typeof createCliContainer>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-bootstrap-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-app', scripts: { test: 'vitest run' } }));
    writeFileSync(join(dir, 'README.md'), '# Demo App\n\nTest project.\n');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'index.ts'), 'export const x = 1;\n');
    await initProjectMemory(new FsProjectInitializer(), dir);
    deps = createCliContainer(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('requires wolf init first when .wolf is missing', async () => {
    const bare = mkdtempSync(join(tmpdir(), 'wolf-bootstrap-bare-'));
    try {
      const bareDeps = createCliContainer(bare);
      await expect(bootstrapProject(bareDeps, { baseDir: bare, createdBy: 'user:cli' })).rejects.toThrow(/wolf init/);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it('creates proposed rules, document-refs and work-thread from scan facts', async () => {
    const result = await bootstrapProject(deps, { baseDir: dir, createdBy: 'user:bootstrap' });

    // ≥1 proposed rule (status proposed!)
    expect(result.rules.length).toBeGreaterThanOrEqual(1);
    for (const rule of result.rules) {
      expect(rule.type).toBe('rule');
      expect(rule.status).toBe('proposed');
      expect(rule.tags).toContain('bootstrap');
    }

    // черновики выведены из фактов snapshot: scripts.test из package.json + языки
    const titles = result.rules.map((r) => r.title).join('\n');
    expect(titles).toContain('vitest run');
    expect(titles).toContain('ts');

    // ≥1 document-ref (README.md) и 1 work-thread
    expect(result.documentCount).toBeGreaterThanOrEqual(1);
    expect(result.workThreadId).toBeTruthy();

    // brief непустой, машино-читаемый заголовок, указывает на Стюарда
    expect(result.brief).toContain('# Bootstrap brief');
    expect(result.brief).toContain('Стюард');
    expect(result.brief).toContain(result.workThreadId);

    // объекты реально сохранены и читаются store
    for (const rule of result.rules) {
      expect(await deps.store.get(rule.id)).not.toBeNull();
    }
    expect(await deps.store.get(result.workThreadId)).not.toBeNull();
    const docs = await deps.store.list({ type: 'document-ref' });
    expect(docs.length).toBeGreaterThanOrEqual(1);
  });

  it('re-run does not duplicate document-refs', async () => {
    await bootstrapProject(deps, { baseDir: dir, createdBy: 'user:bootstrap' });
    const second = await bootstrapProject(deps, { baseDir: dir, createdBy: 'user:bootstrap' });
    const docs = await deps.store.list({ type: 'document-ref' });
    expect(docs.length).toBe(second.documentCount);
  });
});
