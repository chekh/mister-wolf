// tests/unit/adapters/cli/face-cli.test.ts
// Волна 2.17 T-04 (test-plan §REQ-10, §REQ-07, §REQ-05-restore): CLI-группа
// `wolf face` — тонкая обёртка над createFaceVersion (guard, номер версии,
// supersede и журнал — внутри use-case) + наблюдаемость через store, без
// чтения файлов памяти напрямую. Паттерн D12/Q11 (memory-facet-cli.test.ts):
// vitest-воркеры не умеют process.chdir — мокаем cwd.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import { createCliContainer } from '../../../../src/bootstrap/container.js';
import { createFaceVersion, type FaceObject } from '../../../../src/app/use-cases/create-face-version.js';
import type { MemoryEvent } from '../../../../src/domain/schemas/memory-event-schema.js';

// Атрибуция — только env (ADR-5): CLI ничего не знает об акторе, guard в use-case.
const STEWARD_ENV: NodeJS.ProcessEnv = { WOLF_ACTOR: 'agent:steward' };

/** REQ-06: G17-флаги face new обязательны (requiredOption) — fixture для посева. */
const G17 = {
  minimalChange: 'only triage wording',
  boundaries: 'essence, frame and T18 statuses are out of the mutation',
  exampleHelps: 'agent sorts docs faster',
  exampleKeep: 'agent still never edits rules',
  verification: 'wolf face history shows the new version',
  rollback: 'wolf face restore <owner> --from <prev>',
};

/** T-05: legacy-запись в .wolf/memory (старый тип playbook / note+howto). */
function writeLegacy(baseDir: string, rel: string, fm: Record<string, unknown> & { id: string; body: string }): void {
  const abs = join(baseDir, '.wolf', 'memory', rel);
  mkdirSync(dirname(abs), { recursive: true });
  const { body, ...frontmatter } = fm;
  writeFileSync(
    abs,
    `---\n${yaml
      .dump({
        title: 'Legacy',
        status: 'active',
        review_state: 'accepted',
        confidence: 'medium',
        importance: 0.5,
        created_at: '2026-09-20T10:00:00Z',
        updated_at: '2026-09-20T10:00:00Z',
        created_by: 'wolf-init',
        schema_version: 1,
        source: { kind: 'manual' },
        related: { files: [], docs: [], decisions: [] },
        tags: [],
        superseded_by: null,
        ...frontmatter,
      })
      .trimEnd()}\n---\n\n${body}`
  );
}

describe('wolf face (T-04: REQ-10 наблюдаемость, REQ-07 breakglass, REQ-05 restore)', () => {
  let dir: string;
  let cwdMock: ReturnType<typeof vi.spyOn>;
  let logs: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-face-cli-'));
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
  });

  async function runFace(args: string[]): Promise<string> {
    const { faceCommand } = await import('../../../../src/adapters/cli/commands/face.js');
    await faceCommand().exitOverride().parseAsync(args, { from: 'user' });
    return logs.join('\n');
  }

  /** Посев версий Стюардом напрямую через use-case (CLI-независимый baseline). */
  async function seed(ownerSkill: string, bodies: string[], reasons?: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const [i, body] of bodies.entries()) {
      const result = await createFaceVersion(
        { ...createCliContainer(dir), env: { ...STEWARD_ENV } },
        { command: 'new', ownerSkill, reason: reasons?.[i] ?? `v${i + 1}`, body, ...G17 }
      );
      ids.push(result.face.id);
    }
    return ids;
  }

  async function faces(ownerSkill: string): Promise<FaceObject[]> {
    const objects = await createCliContainer(dir).store.list({ type: 'face' });
    return objects.filter((o) => (o as FaceObject).owner_skill === ownerSkill).map((o) => o as FaceObject);
  }

  async function eventsOf(type: string): Promise<MemoryEvent[]> {
    return (await createCliContainer(dir).log.readAll()).filter((e) => e.type === type);
  }

  it('face new (env Стюарда): версия v1 с телом из --file и G17-записью мутации', async () => {
    vi.stubEnv('WOLF_ACTOR', 'agent:steward');
    const bodyPath = join(dir, 'face-body.md');
    writeFileSync(bodyPath, '# Playbook from file');

    const out = await runFace([
      'new',
      'skill:demo',
      '--file',
      bodyPath,
      '--reason',
      'initial face',
      '--minimal-change',
      G17.minimalChange,
      '--boundaries',
      G17.boundaries,
      '--example-helps',
      G17.exampleHelps,
      '--example-keep',
      G17.exampleKeep,
      '--verification',
      G17.verification,
      '--rollback',
      G17.rollback,
    ]);

    const list = await faces('skill:demo');
    expect(list).toHaveLength(1);
    expect(list[0]!.body).toBe('# Playbook from file');
    expect(list[0]!.version).toBe('1');
    expect(list[0]!.initiator).toBe('steward');
    expect(out).toContain(list[0]!.id);
    // G17-запись (T-03) создана той же операцией
    const mutation = (await createCliContainer(dir).store.list({ type: 'note' })).find(
      (n) => n.facet === 'history' && n.title.includes('skill:demo')
    );
    expect(mutation).toBeTruthy();
  });

  it('REQ-10 AC1: face list перечисляет лица и их актуальные версии', async () => {
    await seed('skill:alpha', ['alpha-v1', 'alpha-v2']);
    await seed('skill:beta', ['beta-v1']);

    const out = await runFace(['list']);

    const alpha = await faces('skill:alpha');
    expect(out).toContain('skill:alpha');
    expect(out).toContain('skill:beta');
    // актуальная (max версия) alpha — v2, не v1
    expect(out).toContain(alpha.find((f) => f.version === '2')!.id);
    expect(out).not.toContain(alpha.find((f) => f.version === '1')!.id);
    expect(out).toMatch(/skill:alpha\s+v2\s+mem_\S+\s+\[active\]/);
  });

  it('REQ-10 AC2: face history — версии по убыванию, основа/причина/инициатор видны', async () => {
    const ids = await seed('skill:alpha', ['alpha-v1', 'alpha-v2'], ['initial face', 'clarify triage']);

    const out = await runFace(['history', 'skill:alpha']);

    const v2Line = out.split('\n').find((l) => l.includes('v2 '))!;
    const v1Line = out.split('\n').find((l) => l.includes('v1 '))!;
    expect(out.indexOf(v2Line)).toBeLessThan(out.indexOf(v1Line)); // убывание
    expect(v2Line).toContain('initiator=steward');
    expect(v2Line).toContain('clarify triage');
    expect(v2Line).toContain(`based_on=${ids[0]}`);
    expect(v1Line).toContain('initial face');
  });

  it('REQ-10: face show — метаданные и тело актуальной версии', async () => {
    await seed('skill:alpha', ['alpha-v1', 'THE ACTIVE BODY'], ['initial face', 'clarify triage']);

    const out = await runFace(['show', 'skill:alpha']);

    expect(out).toContain('skill:alpha');
    expect(out).toContain('v2');
    expect(out).toContain('initiator: steward');
    expect(out).toContain('reason: clarify triage');
    expect(out).toContain('THE ACTIVE BODY');
  });

  it('REQ-05 AC1: face restore — новая версия с based_on=V_n, без обратной supersede-ссылки', async () => {
    const ids = await seed('skill:alpha', ['body-v1', 'body-v2']);
    vi.stubEnv('WOLF_ACTOR', 'user:owner');
    vi.stubEnv('WOLF_SESSION', 'cli-unit');

    await runFace(['restore', 'skill:alpha', '--from', 'v1', '--reason', 'rollback bad mutation']);

    const versions = await faces('skill:alpha');
    expect(versions).toHaveLength(3);
    const v3 = versions.find((f) => f.version === '3')!;
    const v1 = versions.find((f) => f.version === '1')!;
    const v2 = versions.find((f) => f.version === '2')!;
    expect(v3.body).toBe('body-v1'); // содержание восстановлено
    expect(v3.based_on).toBe(ids[0]); // основа — восстановленная V_n
    expect(v3.initiator).toBe('owner');
    expect(v3.status).toBe('active');
    // обратной supersede-ссылки на V_n нет: прежние рёбра цепочки не переписаны
    expect(v1.superseded_by).toBe(v2.id);
    expect(v2.superseded_by).toBe(v3.id);
    expect(v1.status).toBe('superseded');
    expect(versions.filter((f) => f.status === 'active')).toHaveLength(1);
  });

  it('REQ-05 AC1: restore принимает id версии-основы (--from mem_…)', async () => {
    const ids = await seed('skill:alpha', ['body-v1', 'body-v2']);
    vi.stubEnv('WOLF_ACTOR', 'user:owner');

    await runFace(['restore', 'skill:alpha', '--from', ids[0]!, '--reason', 'rollback by id']);

    const v3 = (await faces('skill:alpha')).find((f) => f.version === '3')!;
    expect(v3.based_on).toBe(ids[0]);
  });

  it('REQ-07 AC2: face breakglass — новая версия + журнал memory.face.breakglass в операции', async () => {
    const ids = await seed('skill:alpha', ['body-v1', 'body-v2']);
    vi.stubEnv('WOLF_ACTOR', 'user:owner');
    vi.stubEnv('WOLF_SESSION', 'cli-unit');

    const out = await runFace(['breakglass', 'skill:alpha', '--from', ids[0]!, '--reason', 'steward face is broken']);

    const v3 = (await faces('skill:alpha')).find((f) => f.version === '3')!;
    expect(v3).toBeTruthy();
    expect(v3.body).toBe('body-v1');
    expect(v3.initiator).toBe('breakglass');
    expect(v3.status).toBe('active');
    expect(out).toContain(v3.id);
    // журнальная запись — в составе самой операции (не отдельным шагом)
    const breakglassEvents = await eventsOf('memory.face.breakglass');
    expect(breakglassEvents).toHaveLength(1);
    expect(breakglassEvents[0]!.payload).toMatchObject({
      owner_skill: 'skill:alpha',
      new: v3.id,
      initiator: 'breakglass',
    });
    const versioned = await eventsOf('memory.face.versioned');
    expect(versioned.some((e) => e.payload.new === v3.id && e.payload.initiator === 'breakglass')).toBe(true);
  });

  it('REQ-07 AC3: breakglass от не-владельца / из агент-сессии — отказ + memory.face.denied', async () => {
    await seed('skill:alpha', ['body-v1']);
    // агент-воркер
    vi.stubEnv('WOLF_ACTOR', 'agent:worker');
    vi.stubEnv('WOLF_SESSION', 'opc-1234');
    await expect(runFace(['breakglass', 'skill:alpha', '--from', 'v1', '--reason', 'nope'])).rejects.toThrow(
      /owner-only/
    );
    // владелец, но вызов из opencode-процесса агента
    vi.stubEnv('WOLF_ACTOR', 'user:owner');
    vi.stubEnv('WOLF_SESSION', 'opc-1234');
    await expect(runFace(['breakglass', 'skill:alpha', '--from', 'v1', '--reason', 'nope'])).rejects.toThrow(
      /agent session/
    );
    const denied = await eventsOf('memory.face.denied');
    expect(denied).toHaveLength(2);
    expect(denied.every((e) => e.payload.command === 'breakglass')).toBe(true);
  });

  it('REQ-04 AC2: restore без --reason — операция не выполняется', async () => {
    await seed('skill:alpha', ['body-v1']);
    vi.stubEnv('WOLF_ACTOR', 'user:owner');
    // commander requiredOption печатает ошибку и выходит ненулём (паттерн соседей,
    // memory-add --title); в тесте это отказ — требует отсутствия побочного эффекта
    await expect(runFace(['restore', 'skill:alpha', '--from', 'v1'])).rejects.toThrow();
    expect(await faces('skill:alpha')).toHaveLength(1);
    expect(await eventsOf('memory.face.versioned')).toHaveLength(1); // только посев
  });

  it('ADR-5: --created-by не принимается — явный отказ с пояснением', async () => {
    vi.stubEnv('WOLF_ACTOR', 'user:owner');
    const g17Flags = [
      '--minimal-change',
      G17.minimalChange,
      '--boundaries',
      G17.boundaries,
      '--example-helps',
      G17.exampleHelps,
      '--example-keep',
      G17.exampleKeep,
      '--verification',
      G17.verification,
      '--rollback',
      G17.rollback,
    ];
    for (const args of [
      ['list', '--created-by', 'user:evil'],
      // new с полным G17-набором: отказ именно по --created-by, а не по requiredOption
      ['new', 'skill:demo', '--reason', 'x', '--body', 'b', ...g17Flags, '--created-by', 'agent:steward'],
      ['restore', 'skill:demo', '--from', 'v1', '--reason', 'x', '--created-by', 'user:evil'],
      ['breakglass', 'skill:demo', '--from', 'v1', '--reason', 'x', '--created-by', 'user:evil'],
      ['history', 'skill:demo', '--created-by', 'user:evil'],
      ['show', 'skill:demo', '--created-by', 'user:evil'],
    ]) {
      await expect(runFace(args)).rejects.toThrow(/--created-by.*env/i);
    }
    expect(await eventsOf('memory.face.versioned')).toHaveLength(0);
  });

  it('REQ-02: wolf face migrate — миграция legacy playbook → face, повтор идемпотентен', async () => {
    writeLegacy(dir, 'shared/playbooks/steward.md', {
      id: 'mem_20260920_steward_ab12cd',
      type: 'playbook',
      title: 'Наставник v1',
      tags: ['steward:nastavnik', 'playbook'],
      owner_skill: 'steward',
      body: 'Протокол мутации.',
    });

    const out1 = await runFace(['migrate']);

    const faces = (await createCliContainer(dir).store.list({ type: 'face' })) as FaceObject[];
    expect(faces).toHaveLength(1);
    expect(faces[0]!.owner_skill).toBe('steward');
    expect(faces[0]!.initiator).toBe('migration');
    expect(out1).toContain('Migrated steward');
    expect(out1).toContain(faces[0]!.id);
    // head скрыт: legacy-запись superseded → face (семантика hide-superseded)
    const head = await createCliContainer(dir).store.get('mem_20260920_steward_ab12cd');
    expect(head?.status).toBe('superseded');
    expect(head?.superseded_by).toBe(faces[0]!.id);

    const out2 = await runFace(['migrate']);
    expect(out2).toContain('Skipped steward');
    expect((await createCliContainer(dir).store.list({ type: 'face' })).length).toBe(1); // дублей нет
  });

  it('REQ-02 AC4: wolf face migrate — howto без owner_skill не мигрируется (отчёт)', async () => {
    writeLegacy(dir, 'shared/notes/plain.md', {
      id: 'mem_20260920_plain_de14ef',
      type: 'note',
      facet: 'howto',
      title: 'Just a howto',
      body: 'Plain steps.',
    });

    const out = await runFace(['migrate']);

    expect(out).toMatch(/1 howto note\(s\) without owner_skill/);
    expect(out).toContain('mem_20260920_plain_de14ef');
    expect((await createCliContainer(dir).store.list({ type: 'face' })).length).toBe(0);
  });

  it('REQ-02: wolf face migrate без кандидатов — чистый пустой ответ; --created-by отвергнут', async () => {
    const out = await runFace(['migrate']);
    expect(out).toContain('Nothing to migrate');
    await expect(runFace(['migrate', '--created-by', 'user:evil'])).rejects.toThrow(/--created-by.*env/i);
  });

  it('face list без лиц — пустой ответ без ошибки', async () => {
    const out = await runFace(['list']);
    expect(out).toContain('No faces');
  });

  it('face history/show неизвестного владельца — UserFacingError', async () => {
    await expect(runFace(['history', 'skill:ghost'])).rejects.toThrow(/No face found for skill:ghost/);
    await expect(runFace(['show', 'skill:ghost'])).rejects.toThrow(/No active face for skill:ghost/);
  });
});
