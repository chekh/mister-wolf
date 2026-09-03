import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProjectMemory } from '../../../src/app/use-cases/init-project-memory.js';
import { bootstrapProject } from '../../../src/app/use-cases/bootstrap-project.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { transitionMemoryObject } from '../../../src/app/use-cases/transition-memory-object.js';
import type { WorkThread } from '../../../src/domain/schemas/thread-schema.js';
import { FsProjectInitializer } from '../../../src/adapters/fs/fs-project-initializer.js';
import { createCliContainer } from '../../../src/bootstrap/container.js';

describe('bootstrapProject', () => {
  let dir: string;
  let deps: ReturnType<typeof createCliContainer>;

  async function createProject(): Promise<{ dir: string; deps: ReturnType<typeof createCliContainer> }> {
    const d = mkdtempSync(join(tmpdir(), 'wolf-bootstrap-'));
    writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'demo-app', scripts: { test: 'vitest run' } }));
    writeFileSync(join(d, 'README.md'), '# Demo App\n\nTest project.\n');
    mkdirSync(join(d, 'src'));
    writeFileSync(join(d, 'src', 'index.ts'), 'export const x = 1;\n');
    await initProjectMemory(new FsProjectInitializer(), d);
    return { dir: d, deps: createCliContainer(d) };
  }

  beforeEach(async () => {
    ({ dir, deps } = await createProject());
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

    // brief непустой, машино-читаемый заголовок; финал v2 (§5.4) — дословно, без Стюарда (Q6)
    expect(result.brief).toContain('# Bootstrap brief');
    expect(result.brief).not.toContain('Steward');
    expect(result.brief).toContain(
      `Onboarding not finished: collapsing drafts and finishing — in dialogue with the user; ` +
        `when done — close the thread (\`wolf transition ${result.workThreadId} completed\`)`
    );
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
    // активный thread переиспользуется, не дублируется
    const threads = await deps.store.list({ type: 'work-thread' });
    expect(threads).toHaveLength(1);
  });

  // §5.1: guard «онбординг уже закрыт» — no-op без скана/черновиков/doc-ref'ов
  it('is a no-op when bootstrap thread is completed, paused or archived', async () => {
    for (const finalStatus of ['completed', 'paused', 'archived'] as const) {
      const project = await createProject();
      try {
        const first = await bootstrapProject(project.deps, {
          baseDir: project.dir,
          createdBy: 'user:bootstrap',
        });
        await transitionMemoryObject(project.deps, first.workThreadId, finalStatus, 'user:test');

        const second = await bootstrapProject(project.deps, {
          baseDir: project.dir,
          createdBy: 'user:bootstrap',
        });

        expect(second.rules).toEqual([]);
        expect(second.documentCount).toBe(0);
        expect(second.workThreadId).toBe(first.workThreadId);
        expect(second.brief).toBe(
          `Onboarding already finished/deferred (thread ${finalStatus}); to re-create — the owner does it manually`
        );
        // скан не выполнялся: doc-ref'ы не добавились
        const docs = await project.deps.store.list({ type: 'document-ref' });
        expect(docs.length).toBe(first.documentCount);
      } finally {
        rmSync(project.dir, { recursive: true, force: true });
      }
    }
  });

  // §5.2: указатель «что и когда» в currentState — id init-отчёта по тегам wolf-init
  it('new thread currentState carries pointer with init report id', async () => {
    const { object: report } = await addMemoryObject(deps, {
      type: 'report',
      title: 'Init report: demo-app',
      body: '## Сделано\n…',
      createdBy: 'wolf-init',
      tags: ['wolf-init', 'onboarding-v2'],
    });

    const result = await bootstrapProject(deps, { baseDir: dir, createdBy: 'user:bootstrap' });
    const thread = (await deps.store.get(result.workThreadId)) as WorkThread;

    expect(thread.current_state).toContain(`report ${report.id}`);
    expect(thread.current_state).toContain('drafts');
    expect(thread.current_state).toContain('document-ref');
    // goal нейтрален: без Стюарда (Q6)
    expect(thread.goal).not.toContain('Steward');
  });

  it('currentState says «без отчёта» when no active init report exists', async () => {
    const result = await bootstrapProject(deps, { baseDir: dir, createdBy: 'user:bootstrap' });
    const thread = (await deps.store.get(result.workThreadId)) as WorkThread;

    expect(thread.current_state).toContain('no report');
    expect(thread.current_state).toContain('drafts');
  });

  it('pointer prefers the latest init report by updated_at', async () => {
    const first = await addMemoryObject(deps, {
      type: 'report',
      title: 'Init report: one',
      body: '…',
      createdBy: 'wolf-init',
      tags: ['wolf-init', 'onboarding-v2'],
    });
    const second = await addMemoryObject(deps, {
      type: 'report',
      title: 'Init report: two',
      body: '…',
      createdBy: 'wolf-init',
      tags: ['wolf-init', 'onboarding-v2'],
    });
    // детерминированный порядок: первый отчёт стареет
    await deps.store.save({ ...first.object, updated_at: '2026-01-01T00:00:00.000Z' });

    const result = await bootstrapProject(deps, { baseDir: dir, createdBy: 'user:bootstrap' });
    const thread = (await deps.store.get(result.workThreadId)) as WorkThread;

    expect(thread.current_state).toContain(`report ${second.object.id}`);
    expect(thread.current_state).not.toContain(`report ${first.object.id}`);
  });
});
