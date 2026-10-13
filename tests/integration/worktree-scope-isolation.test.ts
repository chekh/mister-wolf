import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import { brokenWorktreeHint, resolveMemoryRoot, resolveWorktreeIdentity } from '../../src/adapters/fs/memory-root.js';
import { getCallInjections } from '../../src/app/use-cases/get-call-injections.js';
import { addMemoryObject } from '../../src/app/use-cases/add-memory-object.js';
import { promoteWorktreeMemory } from '../../src/app/use-cases/promote-memory.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../src/adapters/fs/project-paths.js';

// 2.17.1 REQ-02 (R02): изоляция памяти рабочих копий — integration на реальном
// хранилище + реальных `git worktree add` во временных каталогах (тест-план
// S-10…S-18; конвенция integration-слоя: реальные адаптеры, прецедент
// memory-workflow.test.ts). CLI-слой не спавнится: currentScope/baseDir
// передаются так же, как их передаёт memory-call.ts из createCliContainer.

function git(cmd: string, cwd: string): void {
  execSync(cmd, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
}

/** Репозиторий + linked worktrees; общий .wolf живёт в main-чекауте (WP3 §6.1). */
function makeRepo(worktreeRels: string[]): { base: string; main: string; wts: string[] } {
  const base = mkdtempSync(join(tmpdir(), 'wolf-scope-'));
  const main = join(base, 'main');
  mkdirSync(main, { recursive: true });
  git('git init -b main', main);
  git('git -c user.email=t@t -c user.name=t commit -m init --allow-empty', main);
  const wts = worktreeRels.map((rel, i) => {
    const dir = join(base, rel);
    mkdirSync(dirname(dir), { recursive: true });
    git(`git worktree add "${dir}" -b wt-${i}`, main);
    return dir;
  });
  return { base, main, wts };
}

/** Legacy call-injection сырым .md в shared/calls (прецедент tests/e2e/helpers.ts:
 * фронтматтер читается alias-резолвером как note + alias_origin='call-injection'). */
function seedLegacyInjection(
  root: string,
  seed: { id: string; title: string; scope: string; trigger_keywords?: string[] }
): void {
  const q = (s: string) => JSON.stringify(s);
  const now = new Date().toISOString();
  const fm = [
    '---',
    `id: ${seed.id}`,
    'type: call-injection',
    `title: ${q(seed.title)}`,
    'status: active',
    'review_state: accepted',
    'confidence: high',
    'importance: 0.8',
    `created_at: ${q(now)}`,
    `updated_at: ${q(now)}`,
    `created_by: ${q('user:t')}`,
    'schema_version: 1',
    'source:',
    '  kind: manual',
    'related:',
    '  files: []',
    '  docs: []',
    '  decisions: []',
    'tags: []',
    'superseded_by: null',
    `trigger_keywords: [${(seed.trigger_keywords ?? []).map(q).join(', ')}]`,
    `scope: ${q(seed.scope)}`,
    '---',
  ].join('\n');
  const callsDir = join(root, '.wolf', 'memory', 'shared', 'calls');
  mkdirSync(callsDir, { recursive: true });
  writeFileSync(join(callsDir, `${seed.id}.md`), `${fm}\n\nlegacy body of ${seed.id}\n`);
}

const NOW = new Date('2026-10-13T00:00:00.000Z');
const clock = { now: () => NOW };

function makeObj(overrides: Record<string, unknown> & { id: string; type: string }): Record<string, unknown> {
  return {
    title: overrides.id,
    status: 'active',
    confidence: 'medium',
    importance: 0.5,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    created_by: 'user:t',
    review_state: 'accepted',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: '',
    memory_class: 'working',
    truth_role: 'accepted_knowledge',
    lifetime: 'long_term',
    ...overrides,
  };
}

describe('REQ-02 (R02): изоляция worktree-памяти — S-10…S-18 (integration)', () => {
  // fixture A: 'task' однозначно (кто-то ещё — 'other'); fixture B: a/task + b/task
  let A: { base: string; main: string; wts: string[] };
  let B: { base: string; main: string; wts: string[] };
  let storeA: MarkdownMemoryStore;
  let logA: JsonlEventLog;
  let idGenA: HashIdGenerator;
  const ownScopeA = (): string => {
    const w1 = A.wts[0] as string;
    return `worktree:${resolveMemoryRoot(w1).worktree}`;
  };

  beforeAll(() => {
    A = makeRepo(['a/task', 'c/other']);
    B = makeRepo(['a/task', 'b/task']);
    storeA = new MarkdownMemoryStore(A.main);
    logA = new JsonlEventLog(eventsPath(A.main));
    idGenA = new HashIdGenerator();
  });

  afterAll(() => {
    rmSync(A.base, { recursive: true, force: true });
    rmSync(B.base, { recursive: true, force: true });
  });

  /** Вызов доставки «из копии wt» — currentScope/baseDir как из CLI (memory-call.ts:
   * currentScope из createCliContainer().worktree, baseDir = cwd копии). */
  function callFrom(wt: string, input: Parameters<typeof getCallInjections>[1] = {}) {
    const { worktree } = resolveMemoryRoot(wt);
    return getCallInjections({ store: storeA, clock, baseDir: wt }, { currentScope: worktree ?? undefined, ...input });
  }

  it('S-10: legacy call-injection доставляется только своей копии (NFR-01)', async () => {
    seedLegacyInjection(A.main, {
      id: 'inj_legacy_task',
      title: 'legacy fact of task',
      scope: 'worktree:task',
      trigger_keywords: ['legacy'],
    });

    const inW = await callFrom(A.wts[0] as string);
    expect(inW.deliveredIds).toContain('inj_legacy_task');

    const inMain = await getCallInjections({ store: storeA, clock }, {});
    expect(inMain.blocks.join('\n')).not.toContain('inj_legacy_task');
    expect(inMain.hidden).toEqual({ scope: 'main', count: 1 });

    const inOther = await callFrom(A.wts[1] as string);
    expect(inOther.blocks.join('\n')).not.toContain('inj_legacy_task');
  });

  it('S-11: keyword-урок из копии W не доставляется другой копии/main без promote', async () => {
    await storeA.save(
      makeObj({
        id: 'lesson_w1',
        type: 'lesson',
        scope: ownScopeA(),
        trigger_keywords: ['deploy'],
        body: 'lesson body',
      }) as never
    );

    const inW1 = await callFrom(A.wts[0] as string, { topic: 'deploy' });
    expect(inW1.blocks.join('\n')).toContain('lesson_w1');

    const inOther = await callFrom(A.wts[1] as string, { topic: 'deploy' });
    expect(inOther.blocks.join('\n')).not.toContain('lesson_w1');

    const inMain = await getCallInjections({ store: storeA, clock }, { topic: 'deploy' });
    expect(inMain.blocks.join('\n')).not.toContain('lesson_w1');
  });

  it('S-12: чужой объект скрыт во всех 5 ветвях; main/project-scoped доставляются как раньше', async () => {
    const foreignScope = `worktree:${resolveMemoryRoot(A.wts[1] as string).worktree}`;
    await storeA.save(
      makeObj({
        id: 'inj_foreign',
        type: 'note',
        alias_origin: 'call-injection',
        scope: foreignScope,
        trigger_keywords: ['deploy'],
      }) as never
    );
    await storeA.save(
      makeObj({ id: 'lesson_foreign', type: 'lesson', scope: foreignScope, trigger_keywords: ['deploy'] }) as never
    );
    await storeA.save(
      makeObj({ id: 'rule_kw_foreign', type: 'rule', scope: foreignScope, trigger_keywords: ['deploy'] }) as never
    );
    await storeA.save(makeObj({ id: 'rule_fb_foreign', type: 'rule', scope: foreignScope }) as never);
    await storeA.save(
      makeObj({
        id: 'blocker_foreign',
        type: 'note',
        facet: 'pitfall',
        scope: foreignScope,
        thread: 'mem_t9',
        impact: 'x',
      }) as never
    );
    // позитивный контроль AC-4
    await storeA.save(makeObj({ id: 'rule_project', type: 'rule', scope: 'project' }) as never);
    await storeA.save(
      makeObj({ id: 'blocker_own', type: 'note', facet: 'pitfall', thread: 'mem_t9', impact: 'x' }) as never
    );

    const inW1 = await callFrom(A.wts[0] as string, { topic: 'deploy', thread: 'mem_t9' });
    const all = inW1.blocks.join('\n');
    expect(all).not.toContain('foreign');
    expect(all).toContain('rule_project');
    expect(all).toContain('blocker_own');

    const fallback = await callFrom(A.wts[0] as string, { topic: 'zzz-no-match' });
    expect(fallback.blocks.join('\n')).not.toContain('rule_fb_foreign');
    expect(fallback.blocks.join('\n')).toContain('rule_project');
  });

  it('S-13: два одинаковых basename — разные WT-ID; legacy-токен конфликтует, никому не присваивается', async () => {
    const [a, b] = B.wts as [string, string];
    const idA = resolveWorktreeIdentity(a);
    const idB = resolveWorktreeIdentity(b);
    expect(idA?.id).not.toBe(idB?.id); // AC-3: разные идентификаторы
    expect(idA).toMatchObject({ legacyName: 'task', legacyUnique: false });

    const storeB = new MarkdownMemoryStore(B.main);
    seedLegacyInjection(B.main, { id: 'inj_amb_task', title: 'ambiguous task fact', scope: 'worktree:task' });

    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await getCallInjections(
        { store: storeB, clock, baseDir: a },
        { currentScope: resolveMemoryRoot(a).worktree ?? undefined }
      );
      // fail-closed: токен не присвоен ни одной копии молча — конфликт в отчёте
      expect(result.blocks.join('\n')).not.toContain('inj_amb_task');
      expect(result.scopeConflicts).toEqual(['worktree:task']);
      expect(err).toHaveBeenCalledWith(expect.stringContaining('worktree:task'));

      const fromB = await getCallInjections(
        { store: storeB, clock, baseDir: b },
        { currentScope: resolveMemoryRoot(b).worktree ?? undefined }
      );
      expect(fromB.blocks.join('\n')).not.toContain('inj_amb_task');
      expect(fromB.scopeConflicts).toEqual(['worktree:task']);
    } finally {
      err.mockRestore();
    }
  });

  it('S-14: битые git-метаданные — fail-closed: предупреждение, чужой scope не доставляется', async () => {
    const repo = makeRepo(['solo']);
    try {
      const wt = repo.wts[0] as string;
      // порча по тест-плану S-14: указатель .git переписан на несуществующий путь
      writeFileSync(join(wt, '.git'), 'gitdir: /nonexistent/wolf-s14\n');
      expect(resolveMemoryRoot(wt).worktree).toBeNull();
      expect(resolveWorktreeIdentity(wt)).toBeNull();
      expect(brokenWorktreeHint(wt)).toMatch(/broken/i);

      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        // прод-путь root-резолва: битая копия читает локальный (пустой) .wolf
        const localStore = new MarkdownMemoryStore(resolveMemoryRoot(wt).root);
        const result = await getCallInjections({ store: localStore, clock, baseDir: wt }, {});
        expect(result.blocks).toEqual([]);
        expect(err).toHaveBeenCalledWith(expect.stringContaining('broken'));

        // вне git — нормальный main-вид без предупреждения
        const plainDir = mkdtempSync(join(tmpdir(), 'wolf-plain-'));
        try {
          expect(brokenWorktreeHint(plainDir)).toBeNull();
        } finally {
          rmSync(plainDir, { recursive: true, force: true });
        }
      } finally {
        err.mockRestore();
      }
    } finally {
      rmSync(repo.base, { recursive: true, force: true });
    }
  });

  it('S-15: promote из копии переводит оба токена владельца в main, содержание не изменено', async () => {
    const w1 = A.wts[0] as string;
    const byWtId = await addMemoryObject(
      { store: storeA, log: logA, clock, idGen: idGenA },
      {
        type: 'rule',
        title: 'promote wt-id rule',
        body: 'keep this body',
        createdBy: 'user:t',
        extra: { scope: ownScopeA() },
      }
    );
    const byLegacy = await addMemoryObject(
      { store: storeA, log: logA, clock, idGen: idGenA },
      {
        type: 'rule',
        title: 'promote legacy rule',
        body: 'keep that body',
        createdBy: 'user:t',
        extra: { scope: 'worktree:task' },
      }
    );

    const result = await promoteWorktreeMemory(
      { store: storeA, log: logA, clock, idGen: idGenA, resolveIdentity: () => resolveWorktreeIdentity(w1) },
      basename(w1)
    );
    expect(result.promoted).toBeGreaterThanOrEqual(2);
    expect(result.conflicts).toEqual([]);

    expect(((await storeA.get(byWtId.object.id)) as { scope?: string })?.scope).toBe('main');
    const legacyObj = (await storeA.get(byLegacy.object.id)) as { scope?: string; body?: string } | null;
    expect(legacyObj?.scope).toBe('main');
    expect(legacyObj?.body).toBe('keep that body');
  });

  it('S-16: promote при неоднозначном legacy-имени — конфликт, legacy-объекты не переписаны', async () => {
    const [a] = B.wts as [string];
    const storeB = new MarkdownMemoryStore(B.main);
    const logB = new JsonlEventLog(eventsPath(B.main));
    const idGenB = new HashIdGenerator();
    const wtIdA = resolveWorktreeIdentity(a)?.id as string;
    const byWtId = await addMemoryObject(
      { store: storeB, log: logB, clock, idGen: idGenB },
      { type: 'rule', title: 'b wt-id rule', createdBy: 'user:t', extra: { scope: wtIdA } }
    );
    const byLegacy = await addMemoryObject(
      { store: storeB, log: logB, clock, idGen: idGenB },
      { type: 'rule', title: 'b legacy rule', createdBy: 'user:t', extra: { scope: 'worktree:task' } }
    );

    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await promoteWorktreeMemory(
        { store: storeB, log: logB, clock, idGen: idGenB, resolveIdentity: () => resolveWorktreeIdentity(a) },
        'task'
      );
      expect(result.conflicts).toEqual(['worktree:task']);
      expect(((await storeB.get(byWtId.object.id)) as { scope?: string })?.scope).toBe('main');
      expect(((await storeB.get(byLegacy.object.id)) as { scope?: string })?.scope).toBe('worktree:task');
      expect(err).toHaveBeenCalledWith(expect.stringContaining('worktree:task'));
    } finally {
      err.mockRestore();
    }
  });

  it('S-17: promote из main (identity null) — честный 0, объекты не изменены, не падает', async () => {
    const keep = await addMemoryObject(
      { store: storeA, log: logA, clock, idGen: idGenA },
      { type: 'rule', title: 'kept rule', createdBy: 'user:t', extra: { scope: 'worktree:other-copy' } }
    );
    const before = await storeA.list();

    const result = await promoteWorktreeMemory(
      { store: storeA, log: logA, clock, idGen: idGenA, resolveIdentity: () => resolveWorktreeIdentity(A.main) },
      'task'
    );
    expect(result.promoted).toBe(0);
    expect(result.conflicts).toEqual([]);
    expect(((await storeA.get(keep.object.id)) as { scope?: string })?.scope).toBe('worktree:other-copy');
    expect(await storeA.list()).toEqual(before); // объекты не изменены
  });

  it('S-18: новые записи из копии получают WT-ID в scope; явный scope работает как раньше', async () => {
    const w1 = A.wts[0] as string;
    // дефолт ровно как memory-add.ts:69 строит его из createCliContainer().worktree
    const defaultScope = resolveMemoryRoot(w1).worktree ? `worktree:${resolveMemoryRoot(w1).worktree}` : undefined;

    const added = await addMemoryObject(
      { store: storeA, log: logA, clock, idGen: idGenA, defaultScope },
      { type: 'lesson', title: 'fresh worktree lesson', createdBy: 'user:t', extra: { trigger_keywords: ['fresh'] } }
    );
    expect(added.object.scope).toMatch(/^worktree:w-[0-9a-f]{12}$/);
    expect(added.object.scope).toBe(ownScopeA());

    // явный scope сильнее дефолта — как раньше (WP3 §6.2)
    const explicit = await addMemoryObject(
      { store: storeA, log: logA, clock, idGen: idGenA, defaultScope },
      { type: 'rule', title: 'explicit scope rule', createdBy: 'user:t', extra: { scope: 'project' } }
    );
    expect(explicit.object.scope).toBe('project');
  });
});
