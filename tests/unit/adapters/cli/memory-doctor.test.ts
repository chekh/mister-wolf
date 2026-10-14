// tests/unit/adapters/cli/memory-doctor.test.ts
// Волна 2.17 T-06 (test-plan §NFR-02): lintFaces — чистая механика doctor-проверок
// лиц: дубликат канонического face, битый based_on, legacy+face одновременно,
// face вне контракта (записи, отбракованные парсером store — вход faceProblems).
//
// 2.17.1 REQ-03 (R04, AC-5): секция doctor «Face operations (recoverable
// mutations)» — незавершённая операция с opId и подсказкой recover; после
// recover секции нет. Паттерн face-recover-cli.test.ts: мок cwd + env.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { lintFaces } from '../../../../src/adapters/cli/commands/memory-doctor.js';
import { ProjectsRegistry } from '../../../../src/adapters/fs/projects-registry.js';
import { createCliContainer } from '../../../../src/bootstrap/container.js';
import { worktreeScopeToken } from '../../../../src/adapters/fs/memory-root.js';
import { createFaceVersion } from '../../../../src/app/use-cases/create-face-version.js';
import { resumeFaceOperation, type FaceFaultInjector } from '../../../../src/app/use-cases/face-operation.js';
import type { MemoryObject } from '../../../../src/domain/schemas/memory-object-schema.js';

type Fm = Record<string, unknown>;

function mem(id: string, fm: Fm): MemoryObject {
  return {
    id,
    type: 'note',
    title: id,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-10-13T10:00:00Z',
    updated_at: '2026-10-13T10:00:00Z',
    created_by: 'user:cli',
    source: { kind: 'manual' },
    ...fm,
  } as MemoryObject;
}

function face(id: string, fm: Fm = {}): MemoryObject {
  return mem(id, {
    type: 'face',
    owner_skill: 'skill:demo',
    version: '1',
    reason: 'initial',
    initiator: 'steward',
    ...fm,
  });
}

/** Legacy-playbook: note + facet howto + owner_skill (alias-резолв playbook даёт то же). */
function legacy(id: string, fm: Fm = {}): MemoryObject {
  return mem(id, { facet: 'howto', owner_skill: 'skill:demo', ...fm });
}

describe('lintFaces (2.17 NFR-02: гигиена канонических лиц)', () => {
  it('(а) два активных face одного owner_skill — duplicate canonical face на каждом дубле; superseded не считается', () => {
    const findings = lintFaces(
      [
        face('mem_a', { version: '1', status: 'superseded' }),
        face('mem_b', { version: '2' }),
        face('mem_c', { version: '3' }),
      ],
      []
    );
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.file).sort()).toEqual(['mem_b', 'mem_c']);
    for (const f of findings) expect(f.issue).toContain('duplicate canonical face for skill:demo');
  });

  it('единственный активный face с валидным based_on — находок нет', () => {
    const findings = lintFaces(
      [face('mem_a'), face('mem_b', { version: '2', based_on: 'mem_a', status: 'superseded' })],
      []
    );
    expect(findings).toEqual([]);
  });

  it('(в) based_on указывает на несуществующий id — находка на записи-версии', () => {
    const findings = lintFaces([face('mem_a', { based_on: 'mem_ghost' })], []);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('mem_a');
    expect(findings[0]!.issue).toContain('based_on mem_ghost does not exist');
  });

  it('(г) активная legacy-playbook рядом с face — находка с указанием wolf face migrate; superseded/archived legacy чисты', () => {
    const dirty = lintFaces([face('mem_f'), legacy('mem_l')], []);
    expect(dirty).toHaveLength(1);
    expect(dirty[0]!.file).toBe('mem_l');
    expect(dirty[0]!.issue).toContain('active legacy playbook for skill:demo');
    expect(dirty[0]!.issue).toContain('wolf face migrate');

    const clean = lintFaces(
      [face('mem_f'), legacy('mem_old', { status: 'superseded' }), legacy('mem_arch', { status: 'archived' })],
      []
    );
    expect(clean).toEqual([]);
  });

  it('(г) legacy-playbook без face — норма до миграции; howto без owner_skill — не лицо (REQ-02 AC4)', () => {
    expect(lintFaces([legacy('mem_l')], [])).toEqual([]);
    const noOwner = mem('mem_howto', { facet: 'howto' });
    expect(lintFaces([face('mem_f'), noOwner], [])).toEqual([]);
  });

  it('(б) face вне контракта (файл отбракован парсером) — находка по пути файла', () => {
    const findings = lintFaces([], [{ path: 'shared/faces/mem_broken.md', error: 'Required' }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('shared/faces/mem_broken.md');
    expect(findings[0]!.issue).toContain('face does not match its contract');
  });
});

describe('wolf doctor: незавершённые операции лица (2.17.1 REQ-03 AC-5)', () => {
  const G17 = {
    minimalChange: 'triage wording only',
    boundaries: 'essence and frame are out',
    exampleHelps: 'faster doc sorting',
    exampleKeep: 'agent never edits rules',
    verification: 'wolf face history',
    rollback: 'wolf face restore',
  };
  const OP_ID = 'faceop-doc-0001';
  let dir: string;
  let sb: string;
  let cwdMock: ReturnType<typeof vi.spyOn>;
  let logs: string[];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-doc-faceop-'));
    // реестр изолирован песочницей (WOLF_SANDBOX) — живой ~/.config/wolf не трогаем
    sb = mkdtempSync(join(tmpdir(), 'wolf-doc-faceop-sb-'));
    mkdirSync(join(dir, '.wolf', 'memory'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), 'schema_version: 2\n');
    vi.stubEnv('WOLF_SANDBOX', sb);
    // без записи реестра doctor уходит в ранний return «No registered projects»
    await new ProjectsRegistry(join(sb, '.config', 'wolf')).register(dir, 2);
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    cwdMock.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
    rmSync(sb, { recursive: true, force: true });
  });

  async function runDoctor(): Promise<string> {
    logs = []; // вывод только этого запуска (mock пишет в текущий массив)
    const { memoryDoctorCommand } = await import('../../../../src/adapters/cli/commands/memory-doctor.js');
    await memoryDoctorCommand().exitOverride().parseAsync([], { from: 'user' });
    return logs.join('\n');
  }

  it('незавершённая операция → секция с opId и подсказкой recover; после recover секции нет', async () => {
    const fault: FaceFaultInjector = (p) => {
      if (p === 'g17_record') throw new Error(`injected fault at ${p}`);
    };
    await expect(
      createFaceVersion(
        { ...createCliContainer(dir), fault, env: { WOLF_ACTOR: 'agent:steward' } },
        { command: 'new', ownerSkill: 'skill:demo', reason: 'clarify triage', body: 'body-v2', ...G17, opId: OP_ID }
      )
    ).rejects.toThrow(/injected fault/);

    const out = await runDoctor();
    expect(out).toContain('## Face operations (recoverable mutations)');
    expect(out).toContain(`! ${OP_ID}: incomplete face mutation trail (new skill:demo, not applied)`);
    expect(out).toContain(`wolf face recover ${OP_ID}`);

    // recover закрывает след — секция исчезает (запись реестра возвращена:
    // createCliContainer самолечением, иначе ранний return дал бы ложную пустоту)
    await resumeFaceOperation(createCliContainer(dir), OP_ID, 'agent:steward');
    await new ProjectsRegistry(join(sb, '.config', 'wolf')).register(dir, 2);
    const after = await runDoctor();
    expect(after).toContain('sandbox — pruned'); // доктор дошёл до конца, не ранний return
    expect(after).not.toContain('## Face operations (recoverable mutations)');
  });
});

describe('wolf doctor: осиротевшие worktree-scope (F-02 ревью фазы 4 — WT-ID-токены)', () => {
  let dir: string;
  let sb: string;
  let cwdMock: ReturnType<typeof vi.spyOn>;
  let logs: string[];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-doc-orphan-'));
    sb = mkdtempSync(join(tmpdir(), 'wolf-doc-orphan-sb-'));
    mkdirSync(join(dir, '.wolf', 'memory'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), 'schema_version: 2\n');
    vi.stubEnv('WOLF_SANDBOX', sb);
    await new ProjectsRegistry(join(sb, '.config', 'wolf')).register(dir, 2);
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    cwdMock.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
    rmSync(sb, { recursive: true, force: true });
  });

  /** Живая linked-копия без git-подпроцесса: структура .git/worktrees/<имя>/gitdir
   * (указатель на <копия>/.git — тот же контракт, что читает git) + сам каталог. */
  function seedLiveWorktree(name: string): string {
    const wtDir = join(dir, name);
    mkdirSync(wtDir, { recursive: true });
    mkdirSync(join(dir, '.git', 'worktrees', name), { recursive: true });
    writeFileSync(join(dir, '.git', 'worktrees', name, 'gitdir'), `${join(wtDir, '.git')}\n`);
    return worktreeScopeToken(wtDir);
  }

  async function seedScopedNote(id: string, scope: string): Promise<void> {
    await createCliContainer(dir).store.save(mem(id, { facet: 'context', scope, title: id }));
  }

  async function runDoctor(): Promise<string> {
    logs = [];
    const { memoryDoctorCommand } = await import('../../../../src/adapters/cli/commands/memory-doctor.js');
    await memoryDoctorCommand().exitOverride().parseAsync([], { from: 'user' });
    return logs.join('\n');
  }

  it('живая WT-ID-копия — НЕ orphan; несуществующий WT-ID и legacy-токен — orphan', async () => {
    const liveToken = seedLiveWorktree('wt-live');
    await seedScopedNote('mem_wt_live', `worktree:${liveToken}`);
    await seedScopedNote('mem_wt_dead', 'worktree:w-0123456789ab');
    await seedScopedNote('mem_legacy_gone', 'worktree:wt-gone');

    const out = await runDoctor();
    expect(out).toContain('## Orphaned worktree scopes');
    expect(out).toContain('worktree:w-0123456789ab'); // WT-ID несуществующей копии
    expect(out).toContain('worktree:wt-gone'); // legacy-токен — прежняя логика
    expect(out).not.toContain(`worktree:${liveToken}`); // живая копия — не orphan
  });
});
