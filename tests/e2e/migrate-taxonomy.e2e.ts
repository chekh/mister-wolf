import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

/**
 * E2E полного цикла `wolf migrate taxonomy` (спека 2.13 §8.2/§10.3):
 * dry-run → apply (id-снапшоты равны, чужие поля целы) → повтор no-op →
 * git-откат + rebuild-index → конфликт-ветка §8.2.5.
 */
const CREATED = '2026-09-29T10:00:00Z';

function baseFm(id: string, type: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Test ${id}`,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: CREATED,
    updated_at: CREATED,
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    type,
    ...overrides,
  };
}

function writeOld(project: string, rel: string, fm: Record<string, unknown>, body: string): void {
  const abs = join(project, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body}`);
}

/** id-снапшот из плоского вывода `wolf list` (строки «<id> [<type>] ...»). */
function listIds(project: string): string[] {
  const list = runCli(['list'], project);
  expect(list.status).toBe(0);
  return list.stdout
    .split('\n')
    .map((l) => /^(\S+) \[/.exec(l)?.[1])
    .filter((id): id is string => id !== undefined)
    .sort();
}

function gitInit(project: string): string {
  execSync('git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm init', { cwd: project });
  return execSync('git rev-parse HEAD', { cwd: project, encoding: 'utf-8' }).trim();
}

describe('wolf migrate taxonomy: полный цикл mini-staging (2.13 §8.2/§10.3)', () => {
  let project: string;
  let initSha: string;

  beforeAll(() => {
    ensureBuilt();
    project = tmpProject();
    // старые типы: observation, document-ref, blocker+work-thread, call-injection
    writeOld(
      project,
      join('.wolf', 'memory', 'shared', 'lessons', 'o1.md'),
      baseFm('o1', 'observation', { custom_legacy_field: 'keep-obs' }),
      'Body of o1.'
    );
    writeOld(
      project,
      join('.wolf', 'memory', 'shared', 'documents', 'd1.md'),
      baseFm('d1', 'document-ref', { source: { kind: 'file', path: 'src/foo.ts' } }),
      'Body of d1.'
    );
    writeOld(
      project,
      join('.wolf', 'memory', 'threads', 't1', 'WORK-THREAD.md'),
      baseFm('t1', 'work-thread', { goal: 'ship taxonomy migration', current_state: '', next_steps: [] }),
      'Thread body.'
    );
    writeOld(
      project,
      join('.wolf', 'memory', 'threads', 't1', 'blockers', 'b1.md'),
      baseFm('b1', 'blocker', { thread: 't1', impact: 'blocks release', custom_legacy_field: 'keep-blk' }),
      'Blocker body.'
    );
    writeOld(
      project,
      join('.wolf', 'memory', 'shared', 'calls', 'ci1.md'),
      baseFm('ci1', 'call-injection', { trigger_keywords: ['e2eprobe'] }),
      'Injection body.'
    );
    writeFileSync(join(project, '.wolf', 'memory', 'events.jsonl'), '');
    writeFileSync(join(project, '.wolf', 'memory', 'relations.jsonl'), '');
    initSha = gitInit(project);
  });

  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it('(a) dry-run: таблица (id, old type, facet), summary by type, WARNING про call-injections', () => {
    const dry = runCli(['migrate', 'taxonomy'], project);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain('# wolf migrate taxonomy (mode: dry-run)');
    expect(dry.stdout).toContain('| o1 | observation | note / facet: legacy |');
    expect(dry.stdout).toContain('| d1 | document-ref | note / facet: legacy |');
    expect(dry.stdout).toContain('| b1 | blocker | note / facet: pitfall / thread -> blocked |');
    expect(dry.stdout).toContain('summary by type: ');
    expect(dry.stdout).toContain('observation: 1');
    expect(dry.stdout).toContain('active call-injections (WARNING)');
    expect(dry.stdout).toContain('migrated: 0 (dry-run)');
    // файлы не тронуты
    expect(existsSync(join(project, '.wolf', 'memory', 'shared', 'lessons', 'o1.md'))).toBe(true);
  });

  it('(b) --apply: файлы переехали, типы новые, facet прописан, чужие поля целы', () => {
    const apply = runCli(['migrate', 'taxonomy', '--apply'], project);
    expect(apply.status).toBe(0);
    expect(apply.stdout).toContain('(mode: apply)');

    // observation жил в lessons/ → мигрирует в notes/
    const o1 = readFileSync(join(project, '.wolf', 'memory', 'shared', 'notes', 'o1.md'), 'utf-8');
    expect(o1).toContain('type: note');
    expect(o1).toContain('facet: legacy');
    expect(o1).toContain('custom_legacy_field: keep-obs');
    expect(existsSync(join(project, '.wolf', 'memory', 'shared', 'lessons', 'o1.md'))).toBe(false);

    const d1 = readFileSync(join(project, '.wolf', 'memory', 'shared', 'notes', 'd1.md'), 'utf-8');
    expect(d1).toContain('type: note');
    expect(existsSync(join(project, '.wolf', 'memory', 'shared', 'documents', 'd1.md'))).toBe(false);

    // blocker с thread: t1 → threads/t1/notes/
    const b1 = readFileSync(join(project, '.wolf', 'memory', 'threads', 't1', 'notes', 'b1.md'), 'utf-8');
    expect(b1).toContain('type: note');
    expect(b1).toContain('facet: pitfall');
    expect(b1).toContain('custom_legacy_field: keep-blk');

    // call-injection → note+howto в shared/notes/ (старый каталог удалён)
    const ci1 = readFileSync(join(project, '.wolf', 'memory', 'shared', 'notes', 'ci1.md'), 'utf-8');
    expect(ci1).toContain('type: note');
    expect(ci1).toContain('facet: howto');
    expect(existsSync(join(project, '.wolf', 'memory', 'shared', 'calls'))).toBe(false);

    // work-thread: файл на месте, тип thread; активный blocker → статус blocked
    const t1 = readFileSync(join(project, '.wolf', 'memory', 'threads', 't1', 'WORK-THREAD.md'), 'utf-8');
    expect(t1).toContain('type: thread');
    expect(t1).toContain('status: blocked');
  });

  it('(c) id-снапшот после apply равен снапшоту до', () => {
    expect(listIds(project)).toEqual(['b1', 'ci1', 'd1', 'o1', 't1']);
  });

  it('(d) повторный --apply — no-op (git-гард §8.2.4: сначала коммит нового состояния)', () => {
    // после (b) рабочее дерево .wolf/memory грязное — commit, чтобы пройти гард
    execSync('git add -A && git -c user.name=t -c user.email=t@t commit -qm migrated', { cwd: project });
    const again = runCli(['migrate', 'taxonomy', '--apply'], project);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('migrated: 0');
    expect(again.stdout).toContain('(nothing to migrate)');
    expect(listIds(project)).toEqual(['b1', 'ci1', 'd1', 'o1', 't1']);
  });

  it('(e) откат к init-коммиту + rebuild-index → старые типы и пути', () => {
    // git checkout одного каталога не удаляет файлы, которых в ревизии нет —
    // чистим каталог фикстуры (tmp) и восстанавливаем из init-коммита целиком
    rmSync(join(project, '.wolf', 'memory'), { recursive: true, force: true });
    const git = spawnSync('git', ['checkout', initSha, '--', '.wolf/memory'], { cwd: project, encoding: 'utf-8' });
    expect(git.status).toBe(0);

    // файлы снова старые: старые пути и старый type в frontmatter
    const o1Old = readFileSync(join(project, '.wolf', 'memory', 'shared', 'lessons', 'o1.md'), 'utf-8');
    expect(o1Old).toContain('type: observation');
    expect(existsSync(join(project, '.wolf', 'memory', 'shared', 'notes', 'o1.md'))).toBe(false);

    const rebuild = runCli(['rebuild-index'], project);
    expect(rebuild.status).toBe(0);
    // id-набор прежний; alias-резолвер читает старые файлы (list жив)
    expect(listIds(project)).toEqual(['b1', 'ci1', 'd1', 'o1', 't1']);
  });
});

describe('wolf migrate taxonomy: конфликт-ветка §8.2.5', () => {
  let project: string;

  beforeAll(() => {
    ensureBuilt();
    project = tmpProject();
    // тред в completed с активным blocker — конфликт смены статуса
    writeOld(
      project,
      join('.wolf', 'memory', 'threads', 'td', 'WORK-THREAD.md'),
      baseFm('td', 'work-thread', { status: 'completed', goal: 'done', current_state: '', next_steps: [] }),
      'Thread body.'
    );
    writeOld(
      project,
      join('.wolf', 'memory', 'threads', 'td', 'blockers', 'b2.md'),
      baseFm('b2', 'blocker', { thread: 'td', impact: 'late blocker' }),
      'Blocker body.'
    );
    writeFileSync(join(project, '.wolf', 'memory', 'events.jsonl'), '');
    writeFileSync(join(project, '.wolf', 'memory', 'relations.jsonl'), '');
    gitInit(project);
  });

  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it('dry-run exit 2; apply exit 2: тред не тронут, blocker мигрирует отдельно', () => {
    const dry = runCli(['migrate', 'taxonomy'], project);
    expect(dry.status).toBe(2);
    expect(dry.stdout).toContain('conflicts (untouched)');
    expect(dry.stdout).toContain('td');

    const apply = runCli(['migrate', 'taxonomy', '--apply'], project);
    expect(apply.status).toBe(2);

    // фактическое поведение taxonomy-migration.ts: конфликтный тред не трогается
    // вообще (даже rename типа), но причина мигрирует как обычная note
    const td = readFileSync(join(project, '.wolf', 'memory', 'threads', 'td', 'WORK-THREAD.md'), 'utf-8');
    expect(td).toContain('type: work-thread');
    expect(td).toContain('status: completed');
    const b2 = readFileSync(join(project, '.wolf', 'memory', 'threads', 'td', 'notes', 'b2.md'), 'utf-8');
    expect(b2).toContain('type: note');
    expect(b2).toContain('facet: pitfall');
  });
});
