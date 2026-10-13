// tests/integration/live-face-update.test.ts
// 2.17.1 T4 (REQ-01 (R01), design §3.6/ADR-6, test-plan S-01…S-08): свежая
// установка сеет рабочую методику Стюарда (`wolf face new` + 7 полей G17,
// env-атрибуция, без второго generic supersede); re-init `wolf init --yes`
// обновляет live-лица трёх популяций (2.16.3 legacy-howto → seed+поглощение;
// 2.17.0 seed/migration-дрейф → template update; steward-мутнувшие → diverged,
// лицо не тронуто); `wolf sync` память лиц не меняет (D4).
// «Старый шаблон» для S-06 — дословное тело steward-nastavnik.md выпуска
// 2.17.0 (история файла, daac1b1…903a45b), не выдуманное.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import yaml from 'js-yaml';
import { createFaceVersion } from '../../src/app/use-cases/create-face-version.js';
import { createCliContainer } from '../../src/bootstrap/container.js';

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/bootstrap/cli.js');
const G17_FLAGS = [
  '--reason',
  '--minimal-change',
  '--boundaries',
  '--example-helps',
  '--example-keep',
  '--verification',
  '--rollback',
];

// Дословное тело шаблона steward-nastavnik.md из 2.17.0 (история файла).
const OLD_TEMPLATE_BODY_2170 = `
# Наставник — протокол мутации (v1)

Мутатор контекста агентов — всегда Стюард. Воркеры и координаторы сами
себя не мутируют: жалобу подаёт исполнитель, мутацию вносит Наставник
через память Wolf.

## Протокол мутации (обязателен)

1. **Прочитай текущий контекст агента**: \`wolf search "<тег> playbook"
   --hide-superseded\` — возьми актуальную (не суперседенную) запись,
   проверь owner_skill (тег-агент или skill:<агент>). Актуального
   playbook'а нет → создаёшь первую версию, supersede не нужен.
2. **Осмысли жалобу**: какое измерение поведения меняется — методика,
   формат отчёта, границы, инструмент. Жалоба без конкретики → верни
   вопрос передавшему жалобу (в жалобном контуре v2 жалобу передаёт
   диспетчер/владелец), не гадай.
3. **Зафиксируй новую версию**: \`wolf add --type playbook --tags
   "<тег>,playbook"\` — title с номером версии, тело = ПОЛНОЕ содержимое
   новой версии (не диффом), причина изменения в конце тела.
4. **Supersede старой**: \`wolf supersede <old-id> <new-id>\` — цепочка
   версий неразрывна, старая версия не удаляется, а поглощается.
5. **Отчитайся передавшему жалобу** (в жалобном контуре v2 —
   диспетчеру/владельцу): что изменено, новая версия, причина. Не
   выполняй работу воркера.

## Инварианты

- Без фидбека (жалобы) не меняй ничего.
- Мутации всегда авторства \`steward:<лицо>\`; посев — \`wolf-init\`.
- Тег, \`owner_skill\` и agent-id совпадают (контракт plugin-доставки).
- Одна жалоба — одна мутация: не сваливай несколько изменений в версию.
- Ты не аналитик: не анализируй документы и код сам, меняй только
  контекст агентов по фидбеку.
`;

interface RunResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

function runCli(args: string[], cwd: string, envExtra?: NodeJS.ProcessEnv): RunResult {
  // npm_command срезаем: `npx vitest` проставляет 'exec' → isNpxRun() true → набор не пишется
  const { npm_command: _drop, ...env } = process.env;
  const r = spawnSync('node', [cliPath, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { ...env, ...envExtra },
  });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

function faceIds(showOrHistoryStdout: string): Map<string, { id: string; status: string }> {
  const out = new Map<string, { id: string; status: string }>();
  for (const line of showOrHistoryStdout.split('\n')) {
    const m = line.match(/^v(\d+)\s+(mem_\S+)\s+\[(\w+)\]/);
    if (m) out.set(m[1]!, { id: m[2]!, status: m[3]! });
  }
  return out;
}

function readEvents(dir: string): Array<Record<string, unknown>> {
  const p = join(dir, '.wolf', 'memory', 'events.jsonl');
  return readFileSync(p, 'utf-8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function writeLegacyPlaybook(dir: string, id: string): void {
  // 2.16.3: seeded playbook = type playbook (alias note+howto), playbooks/
  const abs = join(dir, '.wolf', 'memory', 'shared', 'playbooks', `${id}.md`);
  mkdirSync(dirname(abs), { recursive: true });
  const created = '2026-01-15T10:00:00Z';
  writeFileSync(
    abs,
    `---\n${yaml
      .dump({
        id,
        title: 'Наставник v1 (2.16.3)',
        status: 'active',
        review_state: 'accepted',
        confidence: 'medium',
        importance: 0.5,
        created_at: created,
        updated_at: created,
        created_by: 'wolf-init',
        schema_version: 1,
        source: { kind: 'manual' },
        related: { files: [], docs: [], decisions: [] },
        tags: ['steward:наставник', 'playbook'],
        superseded_by: null,
        type: 'playbook',
        owner_skill: 'steward',
      })
      .trimEnd()}\n---\nСтарый протокол 2.16.3: посев howto, мутация через wolf add + wolf supersede.`
  );
}

function findMemoryFile(dir: string, id: string): string | null {
  for (const sub of ['notes', 'playbooks', 'faces']) {
    const p = join(dir, '.wolf', 'memory', 'shared', sub, `${id}.md`);
    if (existsSync(p)) return p;
  }
  return null;
}

function frontmatterOf(path: string): Record<string, unknown> {
  const m = readFileSync(path, 'utf-8').match(/^---\n([\s\S]*?)\n---\n/);
  return (m ? yaml.load(m[1]!) : {}) as Record<string, unknown>;
}

describe('T4 REQ-01: live-лица — установка и re-init (§3.6)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-live-face-'));
    writeFileSync(join(dir, 'package.json'), '{ "name": "live-face-it" }');
  }, 120_000);
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('S-01: свежая установка — face show steward учит wolf face new + все 7 полей G17', () => {
    expect(runCli(['init', '--full', '--platform', 'opencode'], dir).status).toBe(0);

    const show = runCli(['face', 'show', 'steward'], dir);
    expect(show.status).toBe(0);
    expect(show.stdout).toContain('wolf face new');
    for (const flag of G17_FLAGS) expect(show.stdout, flag).toContain(flag);
    expect(show.stdout).toContain('WOLF_ACTOR'); // атрибуция — env launcher'а
    expect(show.stdout).not.toMatch(/--created-by[=\s]+\S/); // флаг не предписывается (упоминание запрета — можно)
    expect(show.stdout).not.toContain('wolf add --type playbook'); // старый путь мутации
  }, 120_000);

  it('S-02/S-03: мутация по методике шаблона — одна версия, G17-след, чужие рамки не тронуты', () => {
    expect(runCli(['init', '--full', '--platform', 'opencode'], dir).status).toBe(0);
    const facesDir = join(dir, '.wolf', 'memory', 'shared', 'faces');
    const rulesDir = join(dir, '.wolf', 'memory', 'shared', 'rules');
    const before = new Map(readdirSync(facesDir).map((f) => [f, readFileSync(join(facesDir, f), 'utf-8')]));

    const bodyFile = join(dir, 'new-face.md');
    writeFileSync(bodyFile, '# Наставник v2 (mutated)\nНовая методика по жалобе.');
    const mutated = runCli(
      [
        'face',
        'new',
        'steward',
        '--title',
        'Наставник v2 (mutated)',
        '--file',
        bodyFile,
        '--reason',
        'жалоба: методика отвергалась CLI',
        '--minimal-change',
        'замена команды мутации на wolf face new',
        '--boundaries',
        'суть Стюарда и жалобный контур не меняются',
        '--example-helps',
        'мутация проходит без exit 1',
        '--example-keep',
        'посев wolf-init остаётся служебным',
        '--verification',
        'wolf face show steward показывает новую версию',
        '--rollback',
        'wolf face restore steward --from v1',
      ],
      dir,
      { WOLF_ACTOR: 'agent:steward' }
    );
    expect(mutated.status).toBe(0);
    expect(mutated.stdout).toMatch(/Created face steward v2/);

    // ровно одна новая версия; v1 погашен самой командой
    const history = runCli(['face', 'history', 'steward'], dir).stdout;
    const versions = faceIds(history);
    expect(versions.size).toBe(2);
    expect(versions.get('2')!.status).toBe('active');
    expect(versions.get('1')!.status).toBe('superseded');
    const v1File = findMemoryFile(dir, versions.get('1')!.id);
    expect(frontmatterOf(v1File!)['superseded_by'] as string).toBe(versions.get('2')!.id);

    // второй generic supersede не выполнялся: ровно одно событие supersede для v1
    const supersedeEvents = readEvents(dir).filter(
      (e) =>
        e['type'] === 'memory.superseded' && (e['payload'] as { old_id?: string })?.old_id === versions.get('1')!.id
    );
    expect(supersedeEvents).toHaveLength(1);

    // G17-запись с 7 полями
    const notesDir = join(dir, '.wolf', 'memory', 'shared', 'notes');
    const mutationFile = readdirSync(notesDir)
      .map((f) => join(notesDir, f))
      .find((p) => readFileSync(p, 'utf-8').includes('mutation: steward v2'));
    expect(mutationFile, 'G17-запись mutation: steward v2').toBeDefined();
    const noteFm = frontmatterOf(mutationFile!);
    for (const field of [
      'reason',
      'minimal_change',
      'boundaries',
      'example_helps',
      'example_keep',
      'verification',
      'rollback',
    ]) {
      expect(String(noteFm[field] ?? ''), field).not.toBe('');
    }

    // чужие рамки не тронуты: остальные лица байт-в-байт, правил не появилось
    for (const [f, content] of before) {
      if (content.includes('owner_skill: steward')) continue;
      expect(readFileSync(join(facesDir, f), 'utf-8'), f).toBe(content);
    }
    expect(existsSync(rulesDir) ? readdirSync(rulesDir).length : 0).toBe(0);
  }, 120_000);

  it('S-04: неуполномоченный актор отклонён guard’ом', () => {
    expect(runCli(['init', '--full', '--platform', 'opencode'], dir).status).toBe(0);

    const denied = runCli(
      [
        'face',
        'new',
        'steward',
        '--body',
        'x',
        '--reason',
        'r',
        '--minimal-change',
        'm',
        '--boundaries',
        'b',
        '--example-helps',
        'h',
        '--example-keep',
        'k',
        '--verification',
        'v',
        '--rollback',
        'rb',
      ],
      dir,
      { WOLF_ACTOR: 'user:attacker' }
    );
    expect(denied.status).not.toBe(0);
    expect(`${denied.stdout}${denied.stderr}`).toContain('steward-only');
  }, 120_000);

  it('S-05: 2.16.3 → re-init `wolf init --yes` — посев шаблоном + поглощение legacy howto', () => {
    expect(runCli(['init'], dir).status).toBe(0); // минимальный: скелет, лиц нет
    writeLegacyPlaybook(dir, 'mem_20260115_legacy_ab12cd');

    const reinit = runCli(['init', '--yes'], dir);
    expect(reinit.status).toBe(0);
    expect(reinit.stdout).toContain('steward-nastavnik.md created');
    expect(reinit.stdout).toContain('superseded legacy howto mem_20260115_legacy_ab12cd');

    // активное лицо = НОВЫЙ шаблон (не legacy-body), дублей канона нет
    const show = runCli(['face', 'show', 'steward'], dir);
    expect(show.status).toBe(0);
    expect(show.stdout).toContain('wolf face new');
    expect(show.stdout).not.toContain('Старый протокол 2.16.3');
    const history = faceIds(runCli(['face', 'history', 'steward'], dir).stdout);
    expect(history.size).toBe(1); // одна операция = одна версия

    // legacy-howto поглощён (superseded → на новое лицо), где бы ни жил файл
    const legacyFile = findMemoryFile(dir, 'mem_20260115_legacy_ab12cd')!;
    const legacyFm = frontmatterOf(legacyFile);
    expect(legacyFm['status']).toBe('superseded');
    expect(legacyFm['superseded_by']).toBe(history.get('1')!.id);
    expect(
      readEvents(dir).some(
        (e) =>
          e['type'] === 'memory.superseded' &&
          (e['payload'] as { old_id?: string })?.old_id === 'mem_20260115_legacy_ab12cd'
      )
    ).toBe(true);
  }, 120_000);

  it('S-06: 2.17.0 → re-init — template update через журналируемый механизм §3.3', async () => {
    expect(runCli(['init'], dir).status).toBe(0);
    // популяция 2.17.0: лицо initiator=seed со старым телом шаблона (путь посева 2.17.0)
    await createFaceVersion(createCliContainer(dir), {
      command: 'seed',
      ownerSkill: 'steward',
      reason: 'base-set seed: steward-nastavnik.md',
      title: 'Наставник v1 — протокол мутации playbook’ов',
      body: OLD_TEMPLATE_BODY_2170,
      tags: ['steward:наставник', 'playbook'],
    });

    const reinit = runCli(['init', '--yes'], dir);
    expect(reinit.status).toBe(0);
    expect(reinit.stdout).toContain('steward-nastavnik.md updated');
    expect(reinit.stdout).toContain('template update');

    const show = runCli(['face', 'show', 'steward'], dir).stdout;
    expect(show).toContain('template update: steward-nastavnik.md (2.17.1)');
    expect(show).toContain('wolf face new'); // новое тело = новый шаблон
    expect(show).not.toContain('wolf add --type playbook');

    const history = faceIds(runCli(['face', 'history', 'steward'], dir).stdout);
    expect(history.size).toBe(2); // v1 → v2, без дублей
    expect(history.get('2')!.status).toBe('active');
    expect(history.get('1')!.status).toBe('superseded');
    expect(show).toContain('initiator: seed');

    // полный след операции §3.3 в журнале
    const events = readEvents(dir);
    expect(
      events.some(
        (e) =>
          e['type'] === 'memory.face.op_started' &&
          String((e['payload'] as { input?: { reason?: string } }).input?.reason ?? '').includes('template update')
      )
    ).toBe(true);
    expect(events.some((e) => e['type'] === 'memory.face.op_committed')).toBe(true);
  }, 120_000);

  it('S-07/S-08: steward-мутнувшее лицо → diverged; wolf sync его не трогает', () => {
    expect(runCli(['init', '--full', '--platform', 'opencode'], dir).status).toBe(0);
    const bodyFile = join(dir, 'steward-v2.md');
    writeFileSync(bodyFile, '# Наставник (steward-мутация)\nЛокальная правка Стюарда.');
    expect(
      runCli(
        [
          'face',
          'new',
          'steward',
          '--title',
          'Наставник (steward-мутация)',
          '--file',
          bodyFile,
          '--reason',
          'жалоба',
          '--minimal-change',
          'm',
          '--boundaries',
          'b',
          '--example-helps',
          'h',
          '--example-keep',
          'k',
          '--verification',
          'v',
          '--rollback',
          'r',
        ],
        dir,
        { WOLF_ACTOR: 'agent:steward' }
      ).status
    ).toBe(0);
    const before = runCli(['face', 'show', 'steward'], dir).stdout;

    // S-07: re-init → diverged, лицо не изменено (зона Стюарда, D4)
    const reinit = runCli(['init', '--yes'], dir);
    expect(reinit.status).toBe(0);
    expect(reinit.stdout).toContain('diverged');
    expect(runCli(['face', 'show', 'steward'], dir).stdout).toBe(before);
    expect(faceIds(runCli(['face', 'history', 'steward'], dir).stdout).size).toBe(2); // v3 не создана

    // S-08: wolf sync не меняет содержимое лица (mutated-skip памяти — как сейчас)
    const facesDir = join(dir, '.wolf', 'memory', 'shared', 'faces');
    const bytesBefore = readdirSync(facesDir)
      .map((f) => readFileSync(join(facesDir, f), 'utf-8'))
      .sort();
    expect(runCli(['sync'], dir).status).toBe(0);
    expect(runCli(['face', 'show', 'steward'], dir).stdout).toBe(before);
    expect(
      readdirSync(facesDir)
        .map((f) => readFileSync(join(facesDir, f), 'utf-8'))
        .sort()
    ).toEqual(bytesBefore);
  }, 120_000);
});
