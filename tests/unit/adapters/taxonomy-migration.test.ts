import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join, relative, dirname } from 'path';
import yaml from 'js-yaml';
import { DEPRECATED_TYPE_ALIASES, MEMORY_TYPES } from '../../../src/domain/memory-types.js';
import { targetPathFor } from '../../../src/adapters/fs/project-paths.js';
import { parseFrontmatter } from '../../../src/adapters/fs/layout-migration.js';
import { planTaxonomyMigration, applyTaxonomyMigration } from '../../../src/adapters/fs/taxonomy-migration.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { memoryMigrateCommand } from '../../../src/adapters/cli/commands/memory-migrate.js';

// vitest threads-pool запрещает process.chdir — подменяем safeCwd() команды
// на каталог фикстуры (сам cli-entry остаётся настоящим).
const cliCwd = vi.hoisted(() => ({ cwd: null as string | null }));
vi.mock('../../../src/adapters/cli/cli-entry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/adapters/cli/cli-entry.js')>();
  return { ...actual, safeCwd: () => cliCwd.cwd ?? actual.safeCwd() };
});

function baseFm(id: string): Record<string, unknown> {
  return {
    id,
    title: `Test ${id}`,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-09-29T10:00:00Z',
    updated_at: '2026-09-29T10:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
  };
}

function writeOld(
  baseDir: string,
  rel: string,
  id: string,
  type: string,
  overrides: Record<string, unknown> = {}
): string {
  const abs = join(baseDir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  const fm = { ...baseFm(id), type, ...overrides };
  writeFileSync(abs, `---\n${yaml.dump(fm).trimEnd()}\n---\n\nBody of ${id}.`);
  return abs;
}

function writeThread(baseDir: string, tid: string, status: string): string {
  return writeOld(baseDir, join('.wolf', 'memory', 'threads', tid, 'WORK-THREAD.md'), tid, 'work-thread', {
    status,
    goal: `goal of ${tid}`,
    current_state: '',
    next_steps: [],
  });
}

function readFm(abs: string): Record<string, any> {
  const parsed = parseFrontmatter(readFileSync(abs, 'utf-8'));
  if (!parsed) throw new Error(`unparsable: ${abs}`);
  return parsed.fm;
}

describe('taxonomy-migration (fs)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-tax-mig-'));
    mkdirSync(join(dir, '.wolf', 'memory'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('migrates every DEPRECATED_TYPE_ALIASES row: type, facet, path', async () => {
    const cases: { oldType: string; id: string; from: string; thread?: string }[] = [];
    for (const [oldType, spec] of Object.entries(DEPRECATED_TYPE_ALIASES)) {
      if (oldType === 'work-thread') continue; // спецслучай — отдельный тест
      const id = `m_${oldType.replaceAll('-', '_')}`;
      // размещение по СТАРОМУ канону: shared/<subdirShared>/ или threads/<tid>/<subdirThread>/
      const thread = spec.subdirShared === null ? 't_scope' : undefined;
      const from =
        spec.subdirShared !== null
          ? join('.wolf', 'memory', 'shared', spec.subdirShared, `${id}.md`)
          : join('.wolf', 'memory', 'threads', thread!, spec.subdirThread!, `${id}.md`);
      writeOld(dir, from, id, oldType, thread ? { thread } : {});
      cases.push({ oldType, id, from, thread });
    }

    const planned = await planTaxonomyMigration(dir);
    expect(planned.entries.map((e) => e.oldType).sort()).toEqual(
      Object.keys(DEPRECATED_TYPE_ALIASES)
        .filter((t) => t !== 'work-thread')
        .sort()
    );

    const report = await applyTaxonomyMigration(dir);
    expect(report.entries).toHaveLength(cases.length);
    for (const c of cases) {
      const spec = DEPRECATED_TYPE_ALIASES[c.oldType]!;
      const entry = report.entries.find((e) => e.id === c.id)!;
      expect(entry.oldType).toBe(c.oldType);
      expect(entry.newType).toBe(spec.target);
      if (spec.facet) expect(entry.facet).toBe(spec.facet);
      // путь — по декларации нового типа (targetPathFor)
      const expectedTo = relative(dir, targetPathFor(dir, { type: spec.target, id: c.id, thread: c.thread }));
      expect(entry.to).toBe(expectedTo);
      expect(existsSync(join(dir, expectedTo))).toBe(true);
      const fm = readFm(join(dir, expectedTo));
      expect(fm.type).toBe(spec.target);
      if (spec.facet) expect(fm.facet).toBe(spec.facet);
      // старый путь освобождён (types с notes/-каноном — rewrite in place, путь тот же)
      if (entry.from !== entry.to) expect(existsSync(join(dir, c.from))).toBe(false);
    }
  });

  it('work-thread: file not moved, type -> thread, status untouched without causes', async () => {
    writeThread(dir, 'wt1', 'active');
    const report = await applyTaxonomyMigration(dir);
    const e = report.entries.find((x) => x.id === 'wt1')!;
    expect(e.newType).toBe('thread');
    expect(e.to).toBe(e.from);
    const fm = readFm(join(dir, e.to));
    expect(fm.type).toBe('thread');
    expect(fm.status).toBe('active');
    expect(report.threadStatusChanges).toHaveLength(0);
  });

  it('absorbs blocker/info-request/open-question into thread statuses', async () => {
    writeThread(dir, 'tb', 'active');
    writeOld(dir, join('.wolf', 'memory', 'threads', 'tb', 'blockers', 'b1.md'), 'b1', 'blocker', { thread: 'tb' });
    writeThread(dir, 'ti', 'active');
    writeOld(dir, join('.wolf', 'memory', 'threads', 'ti', 'info-requests', 'i1.md'), 'i1', 'info-request', {
      thread: 'ti',
    });
    writeThread(dir, 'tq', 'active');
    writeOld(dir, join('.wolf', 'memory', 'threads', 'tq', 'notes', 'q1.md'), 'q1', 'open-question', {
      thread: 'tq',
      status: 'open',
    });

    const report = await applyTaxonomyMigration(dir);
    expect(report.threadStatusChanges).toContainEqual({
      threadId: 'tb',
      from: 'active',
      to: 'blocked',
      causeType: 'blocker',
      causeId: 'b1',
    });
    expect(report.threadStatusChanges).toContainEqual({
      threadId: 'ti',
      from: 'active',
      to: 'waiting_answer',
      causeType: 'info-request',
      causeId: 'i1',
    });
    expect(report.threadStatusChanges).toContainEqual({
      threadId: 'tq',
      from: 'active',
      to: 'open',
      causeType: 'open-question',
      causeId: 'q1',
    });
    expect(readFm(join(dir, '.wolf', 'memory', 'threads', 'tb', 'WORK-THREAD.md')).status).toBe('blocked');
    expect(readFm(join(dir, '.wolf', 'memory', 'threads', 'ti', 'WORK-THREAD.md')).status).toBe('waiting_answer');
    expect(readFm(join(dir, '.wolf', 'memory', 'threads', 'tq', 'WORK-THREAD.md')).status).toBe('open');
    // причина мигрирует как note в threads/<tid>/notes/
    const b1 = readFm(join(dir, '.wolf', 'memory', 'threads', 'tb', 'notes', 'b1.md'));
    expect(b1.type).toBe('note');
    expect(b1.facet).toBe('pitfall');
    expect(report.entries.find((e) => e.id === 'b1')!.threadStatusChange).toBe('blocked');
  });

  it('thread status conflicts: non-active thread and mixed causes — thread untouched', async () => {
    writeThread(dir, 'td', 'completed');
    writeOld(dir, join('.wolf', 'memory', 'threads', 'td', 'blockers', 'b2.md'), 'b2', 'blocker', { thread: 'td' });
    writeThread(dir, 'tm', 'active');
    writeOld(dir, join('.wolf', 'memory', 'threads', 'tm', 'blockers', 'b3.md'), 'b3', 'blocker', { thread: 'tm' });
    writeOld(dir, join('.wolf', 'memory', 'threads', 'tm', 'info-requests', 'i2.md'), 'i2', 'info-request', {
      thread: 'tm',
    });

    const report = await applyTaxonomyMigration(dir);
    expect(report.conflicts.map((c) => c.id)).toEqual(expect.arrayContaining(['td', 'tm']));
    expect(report.threadStatusChanges).toHaveLength(0);
    // конфликтные треды не тронуты вообще (даже rename типа)
    const td = readFm(join(dir, '.wolf', 'memory', 'threads', 'td', 'WORK-THREAD.md'));
    expect(td.type).toBe('work-thread');
    expect(td.status).toBe('completed');
    const tm = readFm(join(dir, '.wolf', 'memory', 'threads', 'tm', 'WORK-THREAD.md'));
    expect(tm.type).toBe('work-thread');
    expect(tm.status).toBe('active');
    // сами причины мигрируют как обычные note
    expect(readFm(join(dir, '.wolf', 'memory', 'threads', 'td', 'notes', 'b2.md')).type).toBe('note');
    expect(readFm(join(dir, '.wolf', 'memory', 'threads', 'tm', 'notes', 'b3.md')).type).toBe('note');
  });

  it('active call-injections migrate with a warning block; archived — silently', async () => {
    writeOld(dir, join('.wolf', 'memory', 'shared', 'calls', 'ci1.md'), 'ci1', 'call-injection');
    writeOld(dir, join('.wolf', 'memory', 'shared', 'calls', 'ci2.md'), 'ci2', 'call-injection', {
      status: 'archived',
    });

    const report = await applyTaxonomyMigration(dir);
    expect(report.callInjections.map((e) => e.id)).toEqual(['ci1']);
    for (const id of ['ci1', 'ci2']) {
      const fm = readFm(join(dir, '.wolf', 'memory', 'shared', 'notes', `${id}.md`));
      expect(fm.type).toBe('note');
      expect(fm.facet).toBe('howto');
    }
  });

  it('idempotent: second apply is a no-op', async () => {
    writeThread(dir, 't1', 'active');
    writeOld(dir, join('.wolf', 'memory', 'threads', 't1', 'blockers', 'b1.md'), 'b1', 'blocker', { thread: 't1' });
    writeOld(dir, join('.wolf', 'memory', 'shared', 'lessons', 'o1.md'), 'o1', 'observation');

    await applyTaxonomyMigration(dir);
    const second = await applyTaxonomyMigration(dir);
    expect(second.entries).toHaveLength(0);
    expect(second.threadStatusChanges).toHaveLength(0);
    expect(second.summaryByType).toEqual({});
    // статус треда не деградирует на повторном прогоне
    expect(readFm(join(dir, '.wolf', 'memory', 'threads', 't1', 'WORK-THREAD.md')).status).toBe('blocked');
  });

  it('unparsable files untouched and reported', async () => {
    const broken = join(dir, '.wolf', 'memory', 'shared', 'notes', 'broken.md');
    mkdirSync(dirname(broken), { recursive: true });
    writeFileSync(broken, '---\nid: broken\ntype: [unclosed\n---\n\nBody.');
    const before = readFileSync(broken, 'utf-8');

    const report = await applyTaxonomyMigration(dir);
    expect(report.unparsable).toHaveLength(1);
    expect(report.unparsable[0]!.path.endsWith('broken.md')).toBe(true);
    expect(readFileSync(broken, 'utf-8')).toBe(before);
  });

  it('task-brief untouched (spec 2.13 §8.2.6)', async () => {
    const p = writeOld(dir, join('.wolf', 'memory', 'threads', 'tt', 'tasks', 'tb1.md'), 'tb1', 'task-brief');
    const before = readFileSync(p, 'utf-8');

    const report = await applyTaxonomyMigration(dir);
    expect(report.entries.find((e) => e.id === 'tb1')).toBeUndefined();
    expect(report.unparsable).toHaveLength(0);
    expect(readFileSync(p, 'utf-8')).toBe(before);
  });

  it('foreign frontmatter fields survive; existing facet not overwritten', async () => {
    writeOld(dir, join('.wolf', 'memory', 'shared', 'notes', 'c1.md'), 'c1', 'context', { custom_field: 'x' });
    writeOld(dir, join('.wolf', 'memory', 'shared', 'blockers', 'b1.md'), 'b1', 'blocker', { facet: 'context' });
    // уже новый тип с чужим полем — файл не трогается вовсе
    const untouched = writeOld(dir, join('.wolf', 'memory', 'shared', 'notes', 'n1.md'), 'n1', 'note', {
      custom_field: 'y',
    });
    const untouchedBefore = readFileSync(untouched, 'utf-8');

    const report = await applyTaxonomyMigration(dir);
    expect(readFm(join(dir, '.wolf', 'memory', 'shared', 'notes', 'c1.md')).custom_field).toBe('x');
    const b1 = readFm(join(dir, '.wolf', 'memory', 'shared', 'notes', 'b1.md'));
    expect(b1.facet).toBe('context'); // свой facet сохранён, pitfall не прописан
    expect(report.entries.find((e) => e.id === 'b1')!.facet).toBeUndefined();
    expect(report.entries.find((e) => e.id === 'n1')).toBeUndefined();
    expect(readFileSync(untouched, 'utf-8')).toBe(untouchedBefore);
  });

  it('removes empty old dirs after apply; keeps tasks/ and lessons/', async () => {
    writeOld(dir, join('.wolf', 'memory', 'shared', 'documents', 'd1.md'), 'd1', 'document', {
      source: { kind: 'file', path: 'src/foo.ts' },
    });
    mkdirSync(join(dir, '.wolf', 'memory', 'shared', 'playbooks'), { recursive: true });
    mkdirSync(join(dir, '.wolf', 'memory', 'threads', 't9', 'tasks'), { recursive: true });
    writeOld(dir, join('.wolf', 'memory', 'shared', 'lessons', 'o1.md'), 'o1', 'observation');

    await applyTaxonomyMigration(dir);
    expect(existsSync(join(dir, '.wolf', 'memory', 'shared', 'documents'))).toBe(false);
    expect(existsSync(join(dir, '.wolf', 'memory', 'shared', 'playbooks'))).toBe(false);
    // tasks/ — живой каталог project-типа (§8.2.6), lessons/ — не старый каталог
    expect(existsSync(join(dir, '.wolf', 'memory', 'threads', 't9', 'tasks'))).toBe(true);
    expect(existsSync(join(dir, '.wolf', 'memory', 'shared', 'lessons'))).toBe(true);
  });
});

describe('wolf migrate taxonomy (CLI integration)', () => {
  let dir: string;
  let out: string[];
  let err: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-tax-cli-'));
    cliCwd.cwd = dir;
    out = [];
    err = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      err.push(a.map(String).join(' '));
    });
    process.exitCode = 0;
  });

  afterEach(() => {
    cliCwd.cwd = null;
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  function seed(): void {
    writeOld(dir, join('.wolf', 'memory', 'shared', 'lessons', 'o1.md'), 'o1', 'observation');
    writeThread(dir, 't1', 'active');
    writeOld(dir, join('.wolf', 'memory', 'threads', 't1', 'blockers', 'b1.md'), 'b1', 'blocker', { thread: 't1' });
    writeOld(dir, join('.wolf', 'memory', 'shared', 'calls', 'ci1.md'), 'ci1', 'call-injection');
    writeOld(dir, join('.wolf', 'memory', 'threads', 't2', 'sessions', 's1.md'), 's1', 'session-summary', {
      thread: 't2',
    });
  }

  function collectIds(): string[] {
    const ids: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.md')) {
          const m = readFileSync(full, 'utf-8').match(/^---[\s\S]*?\nid:\s*(\S+)/);
          if (m) ids.push(m[1]!);
        }
      }
    };
    walk(join(dir, '.wolf', 'memory'));
    return ids.sort();
  }

  async function runTaxonomy(...args: string[]): Promise<void> {
    await memoryMigrateCommand().parseAsync(['taxonomy', ...args], { from: 'user' });
  }

  it('dry-run prints the report without touching files', async () => {
    seed();
    const idsBefore = collectIds();

    await runTaxonomy();

    expect(process.exitCode).toBe(0);
    expect(out.join('\n')).toContain('# wolf migrate taxonomy (mode: dry-run)');
    expect(out.join('\n')).toContain('| o1 | observation | note / facet: legacy |');
    expect(out.join('\n')).toContain('| b1 | blocker | note / facet: pitfall / thread -> blocked |');
    expect(out.join('\n')).toContain('summary by type: ');
    expect(out.join('\n')).toContain('active call-injections (WARNING)');
    expect(out.join('\n')).toContain('rollback: git checkout .wolf/memory');
    expect(out.join('\n')).toContain('migrated: 0 (dry-run)');
    // файлы не тронуты
    expect(collectIds()).toEqual(idsBefore);
    expect(existsSync(join(dir, '.wolf', 'memory', 'shared', 'lessons', 'o1.md'))).toBe(true);
  });

  it('apply refuses without a clean git state; --force applies', async () => {
    seed();
    const idsBefore = collectIds();

    await runTaxonomy('--apply');
    expect(process.exitCode).toBe(1);
    expect(err.join('\n')).toContain('Refusing to apply');
    expect(collectIds()).toEqual(idsBefore);

    process.exitCode = 0;
    await runTaxonomy('--apply', '--force');
    expect(process.exitCode).toBe(0);
    expect(out.join('\n')).toContain('(mode: apply)');
    expect(out.join('\n')).toContain('next: run wolf rebuild-index');
    // ни один объект не потерян: id-множество до == после
    expect(collectIds()).toEqual(idsBefore);
  });

  it('apply refuses on dirty .wolf/memory in a git repo', async () => {
    seed();
    execSync('git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm init', { cwd: dir });
    writeFileSync(join(dir, '.wolf', 'memory', 'shared', 'lessons', 'o1.md'), '---\n---\ndirty\n', { flag: 'a' });

    await runTaxonomy('--apply');
    expect(process.exitCode).toBe(1);
    expect(err.join('\n')).toContain('Refusing to apply');
  });

  it('re-apply is a no-op; wolf list sees new types', async () => {
    seed();
    const idsBefore = collectIds();
    await runTaxonomy('--apply', '--force');
    expect(process.exitCode).toBe(0);

    out = [];
    await runTaxonomy('--apply', '--force');
    expect(out.join('\n')).toContain('migrated: 0');
    expect(collectIds()).toEqual(idsBefore);

    const store = new MarkdownMemoryStore(dir);
    const objects = await store.list();
    expect(objects.map((o) => o.id).sort()).toEqual(idsBefore);
    for (const o of objects) expect(MEMORY_TYPES).toContain(o.type);
    const thread = objects.find((o) => o.id === 't1')!;
    expect(thread.type).toBe('thread');
    expect(thread.status).toBe('blocked');
    const blocker = objects.find((o) => o.id === 'b1')!;
    expect(blocker.type).toBe('note');
    expect((blocker as { facet?: string }).facet).toBe('pitfall');
  });

  it('exit code 2 when conflicts present (dry-run and apply)', async () => {
    writeThread(dir, 'td', 'completed');
    writeOld(dir, join('.wolf', 'memory', 'threads', 'td', 'blockers', 'b2.md'), 'b2', 'blocker', { thread: 'td' });

    await runTaxonomy();
    expect(process.exitCode).toBe(2);
    expect(out.join('\n')).toContain('conflicts (untouched)');

    process.exitCode = 0;
    out = [];
    await runTaxonomy('--apply', '--force');
    // apply выполняется (конфликтные не тронуты), но exit 2 сигнализирует
    expect(process.exitCode).toBe(2);
    expect(existsSync(join(dir, '.wolf', 'memory', 'threads', 'td', 'notes', 'b2.md'))).toBe(true);
    expect(readFm(join(dir, '.wolf', 'memory', 'threads', 'td', 'WORK-THREAD.md')).type).toBe('work-thread');
  });
});
