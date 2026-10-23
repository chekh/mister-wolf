import { describe, it, expect, vi } from 'vitest';
import { readFileSync, rmSync } from 'fs';
// Плагин — plain ESM TS вне tsconfig (tsc tests не компилирует); vitest/esbuild
// импортирует без тайпчека. CLI-спавн замокан (fixture-playbook): тест не зависит
// ни от .wolf/-памяти репо (gitignored, есть только на дев-машине), ни от dist.
const ROUTER_LOG = '/tmp/wolf-router-plugin-test/router.log';
const SKILL_LOG = '/tmp/wolf-router-plugin-test/skill-invocations.jsonl';
const {
  execFileMock,
  publishVersion,
  publishFaceConflict,
  FACE_AGENT,
  FACE_ID,
  FACE_BODY,
  ERROR_AGENT,
  EXIT1_AGENT,
  GUARD_AGENT,
  CONFLICT_AGENT,
  CONFLICT_PROPOSED_ID,
  PROPOSED_FACE_ID,
  PROPOSED_HOWTO_ID,
  ACTIVE_NOTE_ID,
  ACTIVE_NOTE,
  TTL_PLAYBOOK,
  TTL_PLAYBOOK_V2,
  TTL_PLAYBOOK_V3,
} = vi.hoisted(() => {
  // WOLF_ROUTER_LOG-шов: лог пишется в tmp-файл, а не в живой .wolf/router.log
  // репо (иначе тесты после мержа в main загрязняли бы dogfood-аналитику владельца).
  process.env.WOLF_ROUTER_LOG = '/tmp/wolf-router-plugin-test/router.log';
  const PLAYBOOK_ID = 'mem_fixture_playbook_v4';
  const PLAYBOOK = {
    id: PLAYBOOK_ID,
    type: 'playbook',
    owner_skill: 'apprentice',
    version: 'v4',
    body: '# Playbook apprentice v4 (lean-формат)\n1. Контекст → 2. План → 3. Проверка',
  };
  // T012: второй канон в моке — worker-hit без fallback
  const WORKER_PLAYBOOK_ID = 'mem_fixture_playbook_worker_v1';
  const WORKER_PLAYBOOK = {
    id: WORKER_PLAYBOOK_ID,
    type: 'playbook',
    owner_skill: 'worker-reviewer',
    version: 'v1',
    body: '# Playbook worker-reviewer v1\nreviewer-canonical-body: зоны обзора',
  };
  // P106-пробы (TTL / ранний стоп / env-продюсер): уникальные agent-id — кэш
  // плагина это Map на уровне модуля, общий на весь тест-файл.
  const TTL_AGENT = 'ttl-probe-p106';
  const TTL_PLAYBOOK_ID = 'mem_fixture_playbook_ttl_v1';
  // тела с непересекающимися маркерами: alpha/beta/gamma — чтобы toContain
  // одной версии не ложно совпадал с другой (v1 — префикс v2 иначе)
  const TTL_PLAYBOOK = {
    id: TTL_PLAYBOOK_ID,
    type: 'playbook',
    owner_skill: TTL_AGENT,
    version: 'v1',
    body: '# ttl probe body alpha',
  };
  // Вариант Б (CR-2026-10-13-02): публикация новой версии — head в search
  // меняется (старая superseded и скрыта --hide-superseded), get отдаёт новую.
  const TTL_PLAYBOOK_V2 = {
    id: 'mem_fixture_playbook_ttl_v2',
    type: 'playbook',
    owner_skill: TTL_AGENT,
    version: 'v2',
    body: '# ttl probe body beta',
  };
  const TTL_PLAYBOOK_V3 = {
    id: 'mem_fixture_playbook_ttl_v3',
    type: 'playbook',
    owner_skill: TTL_AGENT,
    version: 'v3',
    body: '# ttl probe body gamma',
  };
  // хелпер «Стюард опубликовал новую версию»: подменяет head в моке поиска
  const publishVersion = (obj: { id: string; owner_skill: string; version: string; body: string }) => {
    SEARCH_HITS[obj.owner_skill] = `${obj.id} [playbook] # head v${obj.version}\n`;
    GET_OBJECTS[obj.id] = obj;
  };
  const STOP_AGENT = 'early-stop-p106';
  const STOP_A_ID = 'mem_fixture_playbook_stop_a_v1';
  const STOP_B_ID = 'mem_fixture_playbook_stop_b_v2';
  const STOP_A = {
    id: STOP_A_ID,
    type: 'playbook',
    owner_skill: STOP_AGENT,
    version: 'v1',
    body: '# early stop A',
  };
  const STOP_B = {
    id: STOP_B_ID,
    type: 'playbook',
    owner_skill: STOP_AGENT,
    version: 'v2',
    body: '# early stop B',
  };
  const ENV_AGENT = 'env-probe-p106';
  const ENV_PLAYBOOK_ID = 'mem_fixture_playbook_env_v1';
  const ENV_PLAYBOOK = {
    id: ENV_PLAYBOOK_ID,
    type: 'playbook',
    owner_skill: ENV_AGENT,
    version: 'v1',
    body: '# env probe body',
  };
  // 2.18.4: канонический face-resolver (`wolf face resolve`) — fixture-лицо;
  // по умолчанию для любого agent-id — детерминированный miss (ok:false none)
  const FACE_AGENT = 'face-agent-2-18-4';
  const FACE_ID = 'mem_fixture_face_canon';
  const FACE_BODY = '# Лицо face-agent-2-18-4 (канон 2.18.4)';
  const FACE_RESOLVE: Record<string, string> = {
    [FACE_AGENT]: JSON.stringify({
      ok: true,
      face: { id: FACE_ID, body: FACE_BODY, version: '3', hash: 'facehash16' },
    }),
  };
  const publishFaceConflict = (agentId: string) => {
    FACE_RESOLVE[agentId] = JSON.stringify({
      ok: false,
      error: { kind: 'multiple', owner: agentId, candidates: [{ id: 'a', version: '1', updated_at: 't' }] },
    });
  };
  // 2.18.5: resolver вернул ошибку CLI (обе формы runWolf падают без stdout)
  const ERROR_AGENT = 'face-error-p2-18-5';
  // 2.18.5: контракт CLI — miss/conflict печатают JSON на stdout с exit 1:
  // колбэк бросает ошибку, НО stdout передаётся вторым аргументом (как в Node)
  const EXIT1_AGENT = 'face-exit1-p2-18-5';
  // 2.18.5: гвард legacy-пути — proposed-лицо и proposed-howto в выборке НЕ
  // доставляются; active-note с тем же owner выбирается
  const GUARD_AGENT = 'legacy-guard-p2-18-5';
  // 2.18.5: конфликт лиц — выборка содержит proposed-лицо (ловушка обхода);
  // отдельный агент, чтобы мутация FACE_RESOLVE не протекала в GUARD_AGENT-пробы
  const CONFLICT_AGENT = 'face-conflict-p2-18-5';
  const CONFLICT_PROPOSED_ID = 'mem_fixture_face_conflict_proposed';
  const CONFLICT_PROPOSED = {
    id: CONFLICT_PROPOSED_ID,
    type: 'face',
    status: 'proposed',
    owner_skill: CONFLICT_AGENT,
    body: '# conflict proposed face body (must never inject)',
  };
  const PROPOSED_FACE_ID = 'mem_fixture_face_proposed';
  const PROPOSED_FACE = {
    id: PROPOSED_FACE_ID,
    type: 'face',
    status: 'proposed',
    owner_skill: GUARD_AGENT,
    body: '# proposed face body (must never inject)',
  };
  const PROPOSED_HOWTO_ID = 'mem_fixture_howto_proposed';
  const PROPOSED_HOWTO = {
    id: PROPOSED_HOWTO_ID,
    type: 'howto',
    status: 'proposed',
    owner_skill: GUARD_AGENT,
    body: '# proposed howto body (must never inject)',
  };
  const ACTIVE_NOTE_ID = 'mem_fixture_note_active';
  const ACTIVE_NOTE = {
    id: ACTIVE_NOTE_ID,
    type: 'note',
    status: 'active',
    owner_skill: GUARD_AGENT,
    version: 'n1',
    body: '# active note body (legacy allowed)',
  };
  const SEARCH_HITS: Record<string, string> = {
    apprentice: `${PLAYBOOK_ID} [playbook] # Apprentice playbook\n`,
    'worker-reviewer': `${WORKER_PLAYBOOK_ID} [playbook] # Worker reviewer playbook\n`,
    [TTL_AGENT]: `${TTL_PLAYBOOK_ID} [playbook] # TTL probe\n`,
    // два кандидата, ОБА проходят гвард владельца (проба раннего стопа)
    [STOP_AGENT]: `${STOP_A_ID} [playbook] # A\n${STOP_B_ID} [playbook] # B\n`,
    [ENV_AGENT]: `${ENV_PLAYBOOK_ID} [playbook] # env probe\n`,
    // 2.18.5: первая строка — proposed-лицо (ловушка обхода конфликта),
    // затем proposed-howto; выбираемый канал — active-note
    [GUARD_AGENT]: `${PROPOSED_FACE_ID} [face] # proposed face\n${PROPOSED_HOWTO_ID} [howto] # proposed howto\n${ACTIVE_NOTE_ID} [note] # active note\n`,
    // 2.18.5: конфликт лиц — выборка с proposed-лицом обходчика
    [CONFLICT_AGENT]: `${CONFLICT_PROPOSED_ID} [face] # conflict proposed face\n`,
  };
  const GET_OBJECTS: Record<string, object> = {
    [PLAYBOOK_ID]: PLAYBOOK,
    [WORKER_PLAYBOOK_ID]: WORKER_PLAYBOOK,
    [TTL_PLAYBOOK_ID]: TTL_PLAYBOOK,
    [STOP_A_ID]: STOP_A,
    [STOP_B_ID]: STOP_B,
    [ENV_PLAYBOOK_ID]: ENV_PLAYBOOK,
    [PROPOSED_FACE_ID]: PROPOSED_FACE,
    [PROPOSED_HOWTO_ID]: PROPOSED_HOWTO,
    [ACTIVE_NOTE_ID]: ACTIVE_NOTE,
    [CONFLICT_PROPOSED_ID]: CONFLICT_PROPOSED,
  };
  // promisify(execFile) без custom-symbol → стандартный callback-контракт.
  // 2.18.5: колбэк-контракт Node — (err, stdout, stderr): stdout строкой и при
  // ненулевом exit (реальный CLI печатает JSON miss/conflict с exit 1).
  const execFileMock = vi.fn((file: unknown, args: string[], opts: unknown, cb?: unknown) => {
    const done = (typeof opts === 'function' ? opts : cb) as ((err: Error | null, stdout?: string) => void) | undefined;
    if (!done) throw new Error('execFile: callback not found');
    const sub = args?.[1];
    if (sub === 'search') return done(null, SEARCH_HITS[args[2]] ?? '');
    if (sub === 'get') {
      const obj = GET_OBJECTS[args[2]];
      if (obj) return done(null, JSON.stringify(obj));
      return done(new Error(`get: no such object ${args[2]}`));
    }
    // 2.18.4: face-resolver (node-форма [cli, 'face', 'resolve', agentId]);
    // дефолт — детерминированный miss → legacy-путь плагина
    if (sub === 'face' && args[2] === 'resolve') {
      if (args[3] === ERROR_AGENT) return done(new Error('wolf face resolve: simulated CLI failure'));
      if (args[3] === EXIT1_AGENT)
        return done(new Error('CLI exit 1'), JSON.stringify({ ok: false, error: { kind: 'none', owner: args[3] } }));
      return done(
        null,
        FACE_RESOLVE[args[3] as string] ?? JSON.stringify({ ok: false, error: { kind: 'none', owner: args[3] } })
      );
    }
    return done(new Error(`unexpected CLI call: ${JSON.stringify(args)}`));
  });
  return {
    execFileMock,
    publishVersion,
    publishFaceConflict,
    FACE_AGENT,
    FACE_ID,
    FACE_BODY,
    ERROR_AGENT,
    EXIT1_AGENT,
    GUARD_AGENT,
    CONFLICT_AGENT,
    CONFLICT_PROPOSED_ID,
    PROPOSED_FACE_ID,
    PROPOSED_FACE,
    PROPOSED_HOWTO_ID,
    ACTIVE_NOTE_ID,
    ACTIVE_NOTE,
    TTL_PLAYBOOK,
    TTL_PLAYBOOK_V2,
    TTL_PLAYBOOK_V3,
  };
});
vi.mock('child_process', () => ({ execFile: execFileMock }));

// vi.mock хойстится выше импортов — плагин получит замоканный execFile.
// Тестируем templates/-канон (dogfood-копия .opencode/plugins рендерится из него).
import WolfPlaybookPlugin from '../../templates/opencode/plugins/wolf-router.ts';

const HEADER = '# Актуальный playbook';
const makeSystemOutput = (text: string) => ({ system: [text] });
const playbookParts = (output: { system: string[] }) => output.system.filter((p) => String(p).includes(HEADER));

// Волна 0 0.1: router.log при hit различает playbook по имени + вариант canonical
const readRouterLog = (): string => {
  try {
    return readFileSync(ROUTER_LOG, 'utf-8');
  } catch {
    return '';
  }
};
const lastLogLine = (): string => (readRouterLog().trim().split('\n').at(-1) ?? '').replace(/^\S+ /, '');
// get-подкоманды считаем в node-форме [cli, 'get', id] (голый `wolf` в моке
// падает по контракту, плагин переходит на node-фолбэк — как в жизни без global bin)
const getCalls = () => execFileMock.mock.calls.filter((c) => (c[1] as string[])[1] === 'get');

describe('wolf-router plugin', () => {
  it('injects playbook for agent-id: apprentice', async () => {
    const plugin = await WolfPlaybookPlugin.server();
    const output = makeSystemOutput('agent-id: apprentice\n\nТы — аналитик-подмастерье. Работай строго по playbook.');
    await plugin['experimental.chat.system.transform']({}, output);

    expect(playbookParts(output)).toHaveLength(1);
    // Слово из тела fixture-playbook (lean-формат, как в реальном v4)
    expect(playbookParts(output)[0]).toContain('lean');
    // Гвард владельца: get по id из выборки, owner_skill совпал с agent-id
    expect(execFileMock).toHaveBeenCalled();
  });

  it('no marker → nothing injected, CLI not spawned', async () => {
    execFileMock.mockClear();
    const plugin = await WolfPlaybookPlugin.server();
    const output = makeSystemOutput('Ты — аналитик. Работай сам, без playbook.');
    await plugin['experimental.chat.system.transform']({}, output);

    expect(playbookParts(output)).toHaveLength(0);
    expect(output.system).toHaveLength(1);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  // T012: miss канона → инъекция универсального fallback, не пустота
  it('unknown agent-id → fallback playbook injected (no throw)', async () => {
    const plugin = await WolfPlaybookPlugin.server();
    const output = makeSystemOutput('agent-id: net-takogo-agenta-xyz\n\nТы — кто-то неизвестный.');
    await expect(plugin['experimental.chat.system.transform']({}, output)).resolves.toBeUndefined();

    expect(playbookParts(output)).toHaveLength(1);
    expect(playbookParts(output)[0]).toContain('Универсальный playbook');
    expect(playbookParts(output)[0]).not.toContain('lean'); // canonical-маркер не попал
    expect(output.system).toHaveLength(2);
  });

  // T012: канон приоритетен — fallback не примешивается к canonical-инъекту
  it('canonical (apprentice) → injected WITHOUT fallback body', async () => {
    const plugin = await WolfPlaybookPlugin.server();
    const output = makeSystemOutput('agent-id: apprentice\n\nТы — аналитик-подмастерье.');
    await plugin['experimental.chat.system.transform']({}, output);

    expect(playbookParts(output)).toHaveLength(1);
    expect(playbookParts(output)[0]).toContain('lean');
    expect(playbookParts(output)[0]).not.toContain('Универсальный playbook');
  });

  // T012: worker-hit по второму канону в моке — variant=canonical, без fallback
  it('worker-reviewer → canonical hit, no fallback injected', async () => {
    const plugin = await WolfPlaybookPlugin.server();
    const output = makeSystemOutput('agent-id: worker-reviewer\n\nТы — рецензент.');
    await plugin['experimental.chat.system.transform']({}, output);

    expect(playbookParts(output)).toHaveLength(1);
    expect(playbookParts(output)[0]).toContain('reviewer-canonical-body');
    expect(playbookParts(output)[0]).not.toContain('Универсальный playbook');

    expect(lastLogLine()).toMatch(
      /^agent-id=worker-reviewer playbook=hit name=mem_fixture_playbook_worker_v1 variant=legacy source=legacy resolution=none face_id=- version=v1 hash=- session=\S+ injected=yes ms=\d+ bytes=\d+$/
    );
  });

  it('two calls in a row → exactly one injected part (idempotent, no double insert)', async () => {
    const plugin = await WolfPlaybookPlugin.server();
    const output = makeSystemOutput('agent-id: apprentice\n\nТы — аналитик-подмастерье.');
    const transform = plugin['experimental.chat.system.transform'];
    await transform({}, output);
    await transform({}, output);

    expect(playbookParts(output)).toHaveLength(1);
  });

  it('hit: router.log line contains playbook=hit name=<id> variant=canonical injected=yes', async () => {
    const plugin = await WolfPlaybookPlugin.server();
    const output = makeSystemOutput('agent-id: apprentice\n\nТы — аналитик-подмастерье.');
    await plugin['experimental.chat.system.transform']({}, output);
    expect(playbookParts(output)).toHaveLength(1);

    expect(lastLogLine()).toMatch(
      /^agent-id=apprentice playbook=hit name=mem_fixture_playbook_v4 variant=legacy source=legacy resolution=none face_id=- version=v4 hash=- session=\S+ injected=yes ms=\d+ bytes=\d+$/
    );
  });

  // T012: miss-ветки больше нет — fallback логируется как hit variant=fallback
  it('fallback: router.log line playbook=hit name=fallback variant=fallback injected=yes', async () => {
    const plugin = await WolfPlaybookPlugin.server();
    const output = makeSystemOutput('agent-id: net-takogo-2-xyz\n\nТы — неизвестный агент.');
    await plugin['experimental.chat.system.transform']({}, output);

    expect(lastLogLine()).toMatch(
      /^agent-id=net-takogo-2-xyz playbook=hit name=fallback variant=fallback source=default resolution=none face_id=- version=- hash=- session=\S+ injected=yes ms=\d+ bytes=\d+$/
    );
  });
});

describe('P106: TTL 5 мин / ранний стоп / негативный кэш / ms-bytes / WOLF_SESSION / skill-метрика', () => {
  // (а) Вариант Б (CR-2026-10-13-02), переработка TTL-теста — три ожидания:
  //     1. respawn (новая сессия) после истечения TTL → доставлена АКТУАЛЬНАЯ версия;
  //     2. повторная инъекция в ТОЙ ЖЕ сессии → без нового содержания
  //        (мемоизация по session-id, независимо от пересборки system);
  //     3. НОВАЯ сессия в пределах TTL после публикации новой версии →
  //        АКТУАЛЬНАЯ версия (версионированный кэш не отдаёт устаревшую —
  //        остаточный случай №1, F-01 ревью плана).
  // Граница сессии для плагина — WOLF_SESSION (ключ opencode-процесса):
  // respawn моделируется сменой ключа + новой фабрикой server().
  it('вариант Б: мемоизация сессии пиннит версию; новая сессия (даже в пределах TTL) получает актуальную', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const savedSession = process.env.WOLF_SESSION;
    try {
      execFileMock.mockClear();
      // --- сессия A: первая доставка v1 ---
      process.env.WOLF_SESSION = 'sess-ttl-a';
      const plugin = await WolfPlaybookPlugin.server();
      const transform = plugin['experimental.chat.system.transform'];
      const outA1 = makeSystemOutput('agent-id: ttl-probe-p106\n\nТы — проба TTL.');
      await transform({}, outA1);
      expect(playbookParts(outA1)).toHaveLength(1);
      expect(playbookParts(outA1)[0]).toContain(TTL_PLAYBOOK.body);
      const spawnsA = execFileMock.mock.calls.length;
      expect(spawnsA).toBeGreaterThan(0);

      // --- (2) ТО ЖЕ сессия, публикация v2 + пересборка system (< TTL):
      //     нового содержания нет — запечатана v1, спавнов ноль ---
      publishVersion(TTL_PLAYBOOK_V2);
      vi.advanceTimersByTime(4 * 60_000); // 4 мин < TTL 5 мин
      const outA2 = makeSystemOutput('agent-id: ttl-probe-p106\n\nТы — проба TTL.'); // пересобран, без заголовка
      await transform({}, outA2);
      expect(execFileMock.mock.calls.length).toBe(spawnsA); // мемоизация: ре-резолва нет
      expect(playbookParts(outA2)).toHaveLength(1);
      expect(playbookParts(outA2)[0]).toContain(TTL_PLAYBOOK.body); // та же версия
      expect(playbookParts(outA2)[0]).not.toContain(TTL_PLAYBOOK_V2.body);

      // --- (3) НОВАЯ сессия в пределах TTL после публикации v2 → актуальная v2 ---
      process.env.WOLF_SESSION = 'sess-ttl-b';
      const outB = makeSystemOutput('agent-id: ttl-probe-p106\n\nТы — проба TTL.');
      await transform({}, outB);
      expect(execFileMock.mock.calls.length).toBeGreaterThan(spawnsA); // кэш v1 не отдан
      expect(playbookParts(outB)).toHaveLength(1);
      expect(playbookParts(outB)[0]).toContain(TTL_PLAYBOOK_V2.body);
      expect(playbookParts(outB)[0]).not.toContain(TTL_PLAYBOOK.body);
      const spawnsB = execFileMock.mock.calls.length;

      // --- (1) respawn после истечения TTL → актуальная версия (v3) ---
      vi.advanceTimersByTime(6 * 60_000); // 10 мин от первой кэш-записи → TTL истёк
      publishVersion(TTL_PLAYBOOK_V3);
      process.env.WOLF_SESSION = 'sess-ttl-c';
      const outC = makeSystemOutput('agent-id: ttl-probe-p106\n\nТы — проба TTL.');
      await transform({}, outC);
      expect(execFileMock.mock.calls.length).toBeGreaterThan(spawnsB); // respawn был
      expect(playbookParts(outC)).toHaveLength(1);
      expect(playbookParts(outC)[0]).toContain(TTL_PLAYBOOK_V3.body);
      expect(playbookParts(outC)[0]).not.toContain(TTL_PLAYBOOK_V2.body);
    } finally {
      if (savedSession === undefined) delete process.env.WOLF_SESSION;
      else process.env.WOLF_SESSION = savedSession;
      vi.useRealTimers();
    }
  });

  // (б) ранний стоп: оба кандидата проходят гвард → ровно один get
  it('early stop: два подходящих кандидата → ровно один get-спавн, побеждает первый', async () => {
    execFileMock.mockClear();
    const plugin = await WolfPlaybookPlugin.server();
    const output = makeSystemOutput('agent-id: early-stop-p106\n\nТы — проба раннего стопа.');
    await plugin['experimental.chat.system.transform']({}, output);

    expect(playbookParts(output)).toHaveLength(1);
    expect(playbookParts(output)[0]).toContain('early stop A'); // первый кандидат, не max-version
    expect(getCalls()).toHaveLength(1);
  });

  // вариант Б: miss канона → fallback (0 get — только search); повторный вызов
  // в той же сессии — ноль спавнов через сессийную мемоизацию, не через
  // TTL-кэш: search живой раз на новую сессию, null-запись не консультируется
  it('miss → только search (0 get); повтор в той же сессии — ноль спавнов (мемоизация сессии)', async () => {
    execFileMock.mockClear();
    const plugin = await WolfPlaybookPlugin.server();
    const transform = plugin['experimental.chat.system.transform'];
    const out1 = makeSystemOutput('agent-id: neg-cache-p106\n\nНеизвестный агент.');
    await transform({}, out1);
    expect(playbookParts(out1)).toHaveLength(1); // fallback инъецирован
    expect(getCalls()).toHaveLength(0); // только search-спавны
    const afterFirst = execFileMock.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    const out2 = makeSystemOutput('agent-id: neg-cache-p106\n\nНеизвестный агент.');
    await transform({}, out2);
    expect(execFileMock.mock.calls.length).toBe(afterFirst); // мемоизация сессии, спавнов нет
    expect(playbookParts(out2)).toHaveLength(1);
  });

  // (в) ms=/bytes= в router.log — отдельная явная проверка полей
  it('router.log: canonical и fallback строки несут ms=<n> bytes=<n>, bytes > 0', async () => {
    const plugin = await WolfPlaybookPlugin.server();
    const transform = plugin['experimental.chat.system.transform'];

    await transform({}, makeSystemOutput('agent-id: apprentice\n\nТы — аналитик-подмастерье.'));
    expect(lastLogLine()).toMatch(
      /^agent-id=apprentice playbook=hit name=\S+ variant=legacy source=legacy resolution=none face_id=- version=v\d hash=- session=\S+ injected=yes ms=\d+ bytes=\d+$/
    );
    expect(Number(lastLogLine().match(/bytes=(\d+)/)?.[1])).toBeGreaterThan(0);

    await transform({}, makeSystemOutput('agent-id: net-takogo-3-xyz\n\nТы — неизвестный агент.'));
    expect(lastLogLine()).toMatch(
      /^agent-id=net-takogo-3-xyz playbook=hit name=fallback variant=fallback source=default resolution=none face_id=- version=- hash=- session=\S+ injected=yes ms=\d+ bytes=\d+$/
    );
    expect(Number(lastLogLine().match(/bytes=(\d+)/)?.[1])).toBeGreaterThan(0);
  });

  // (г) продюсер WOLF_SESSION: один opc-ключ на процесс, чужой ключ не трогаем
  it('WOLF_SESSION: фабрика ставит opc-ключ если пусто; существующий не перезаписывает', async () => {
    const saved = process.env.WOLF_SESSION;
    try {
      delete process.env.WOLF_SESSION;
      await WolfPlaybookPlugin.server();
      expect(process.env.WOLF_SESSION?.startsWith('opc-')).toBe(true);

      process.env.WOLF_SESSION = 'custom-key';
      await WolfPlaybookPlugin.server();
      expect(process.env.WOLF_SESSION).toBe('custom-key');

      // per-spawn override удалён: execFile зовётся без env-поля (наследование process.env)
      execFileMock.mockClear();
      const plugin = await WolfPlaybookPlugin.server();
      await plugin['experimental.chat.system.transform'](
        {},
        makeSystemOutput('agent-id: env-probe-p106\n\nПроба env.')
      );
      expect(execFileMock.mock.calls.length).toBeGreaterThan(0);
      for (const call of execFileMock.mock.calls) {
        expect((call[2] as { env?: Record<string, string> }).env).toBeUndefined();
      }
    } finally {
      if (saved === undefined) delete process.env.WOLF_SESSION;
      else process.env.WOLF_SESSION = saved;
    }
  });

  // (д) хук skill-invocation: JSONL-метрика с агентом, не-skill и битый вход — мимо
  it('tool.execute.before: skill-вызов пишет {ts, skill, agent}; bash/битый вход — нет', async () => {
    process.env.WOLF_SKILL_LOG = SKILL_LOG;
    rmSync(SKILL_LOG, { force: true });
    try {
      const plugin = await WolfPlaybookPlugin.server();
      // system.transform с agent-id наполняет lastAgentId
      await plugin['experimental.chat.system.transform'](
        {},
        makeSystemOutput('agent-id: apprentice\n\nТы — аналитик.')
      );

      await plugin['tool.execute.before']({ tool: 'skill' }, { args: { name: 'ponytail' } });
      const lines = readFileSync(SKILL_LOG, 'utf-8').trim().split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);
      const entry = JSON.parse(lines[0] as string);
      expect(entry.skill).toBe('ponytail');
      expect(entry.agent).toBe('apprentice');
      expect(typeof entry.ts).toBe('string');

      // не-skill тул — мимо
      await plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'ls' } });
      expect(readFileSync(SKILL_LOG, 'utf-8').trim().split('\n').filter(Boolean)).toHaveLength(1);

      // битый вход — fail-safe, не бросает и не пишет
      await expect(plugin['tool.execute.before'](null, null)).resolves.toBeUndefined();
      expect(readFileSync(SKILL_LOG, 'utf-8').trim().split('\n').filter(Boolean)).toHaveLength(1);
    } finally {
      delete process.env.WOLF_SKILL_LOG;
    }
  });
});

describe('2.18.4: канонический face-resolver (wolf face resolve)', () => {
  const faceResolveCalls = () => execFileMock.mock.calls.filter((c) => (c[1] as string[])[1] === 'face');

  // Свой WOLF_SESSION: сессийная мемоизация пинает инъекцию, агенты
  // worker-reviewer/ttl-пробы уже закэшированы дефолтным ключом выше.
  const useIsolatedSession = (): string => {
    const saved = process.env.WOLF_SESSION;
    process.env.WOLF_SESSION = 'sess-2-18-4';
    return saved === undefined ? '' : saved;
  };

  it('ровно одно активное лицо → инъекция из face-resolver, variant=canonical, name=id лица', async () => {
    const saved = useIsolatedSession();
    try {
      const plugin = await WolfPlaybookPlugin.server();
      const output = makeSystemOutput(`agent-id: ${FACE_AGENT}\n\nТы — агент с лицом.`);
      await plugin['experimental.chat.system.transform']({}, output);

      expect(playbookParts(output)).toHaveLength(1);
      expect(playbookParts(output)[0]).toContain(FACE_BODY);
      expect(playbookParts(output)[0]).not.toContain('Универсальный playbook');
      expect(faceResolveCalls().length).toBeGreaterThan(0);
      expect(lastLogLine()).toMatch(
        new RegExp(
          `^agent-id=${FACE_AGENT} playbook=hit name=${FACE_ID} variant=canonical source=face resolution=unique ` +
            `face_id=${FACE_ID} version=3 hash=facehash16 session=sess-2-18-4 injected=yes ms=\\d+ bytes=\\d+$`
        )
      );
    } finally {
      if (saved === '') delete process.env.WOLF_SESSION;
      else process.env.WOLF_SESSION = saved;
    }
  });

  // 2.18.5 (AC1): конфликт лиц — НЕ выбирать и не внедрять методику: запасной
  // поиск не выполняется вообще, proposed-лицо из выборки не внедряется,
  // агент получает только универсальный fallback; конфликт зафиксирован в логе.
  it('конфликт лиц (ok:false multiple) → методика НЕ выбрана и НЕ внедрена, resolution=conflict', async () => {
    const saved = useIsolatedSession();
    try {
      publishFaceConflict(CONFLICT_AGENT); // резолвер: конфликт активных лиц
      execFileMock.mockClear();
      const plugin = await WolfPlaybookPlugin.server();
      const output = makeSystemOutput(`agent-id: ${CONFLICT_AGENT}\n\nТы — рецензент.`);
      await plugin['experimental.chat.system.transform']({}, output);

      expect(playbookParts(output)).toHaveLength(1);
      expect(playbookParts(output)[0]).toContain('Универсальный playbook'); // только fallback
      expect(playbookParts(output)[0]).not.toContain('must never inject'); // proposed-лицо не внедрено
      // запасной поиск не выбирал кандидата: get по proposed-id не вызывался
      const getIds = getCalls().map((c) => (c[1] as string[])[2]);
      expect(getIds).not.toContain(CONFLICT_PROPOSED_ID);
      expect(lastLogLine()).toMatch(
        new RegExp(
          `^agent-id=${CONFLICT_AGENT} playbook=hit name=fallback variant=fallback source=default resolution=conflict ` +
            `face_id=- version=- hash=- session=sess-2-18-4 injected=yes ms=\\d+ bytes=\\d+$`
        )
      );
    } finally {
      if (saved === '') delete process.env.WOLF_SESSION;
      else process.env.WOLF_SESSION = saved;
    }
  });

  // 2.18.5 (AC1): resolver error — диагностируемый сбой (resolution=error в
  // журнале), не молчаливый fallback к текстовому поиску.
  it('resolver error (CLI failure) → fallback + resolution=error в журнале, legacy-поиск не выполнялся', async () => {
    const saved = useIsolatedSession();
    try {
      execFileMock.mockClear();
      const plugin = await WolfPlaybookPlugin.server();
      const output = makeSystemOutput(`agent-id: ${ERROR_AGENT}\n\nТы — агент с умирающим CLI.`);
      await plugin['experimental.chat.system.transform']({}, output);

      expect(playbookParts(output)).toHaveLength(1);
      expect(playbookParts(output)[0]).toContain('Универсальный playbook');
      // legacy-поиск не выполнялся: search/get по этому агенту не спавнились
      const searched = execFileMock.mock.calls.filter(
        (c) => (c[1] as string[])[1] === 'search' && (c[1] as string[])[2] === ERROR_AGENT
      );
      expect(searched).toHaveLength(0);
      expect(getCalls()).toHaveLength(0);
      expect(lastLogLine()).toMatch(
        new RegExp(
          `^agent-id=${ERROR_AGENT} playbook=hit name=fallback variant=fallback source=default resolution=error ` +
            `face_id=- version=- hash=- session=sess-2-18-4 injected=yes ms=\\d+ bytes=\\d+$`
        )
      );
    } finally {
      if (saved === '') delete process.env.WOLF_SESSION;
      else process.env.WOLF_SESSION = saved;
    }
  });

  // 2.18.5 (AC1): miss → legacy-поиск разрешён, но с гвардом типа/статуса:
  // proposed-лицо (type=face, status=proposed) и proposed-howto отсекаются
  // (ранее выбиралось только по owner_skill), active-note доставляется.
  // 2.18.5: контракт CLI — miss печатается на stdout с exit 1: спавн бросает,
  // но тело ошибки несёт kind=none → legacy-путь выполняется (resolution=none,
  // не error) — регрессионная защита поведения реального CLI.
  it('resolver miss с exit 1 (stdout несёт kind=none) → legacy-путь, resolution=none', async () => {
    const saved = useIsolatedSession();
    try {
      execFileMock.mockClear();
      const plugin = await WolfPlaybookPlugin.server();
      const output = makeSystemOutput(`agent-id: ${EXIT1_AGENT}\n\nТы — агент с exit-1 CLI.`);
      await plugin['experimental.chat.system.transform']({}, output);

      expect(playbookParts(output)).toHaveLength(1);
      expect(playbookParts(output)[0]).toContain('Универсальный playbook'); // search-hit нет → fallback
      const searched = execFileMock.mock.calls.filter(
        (c) => (c[1] as string[])[1] === 'search' && (c[1] as string[])[2] === EXIT1_AGENT
      );
      expect(searched.length).toBeGreaterThan(0); // legacy-поиск ВЫПОЛНЯЛСЯ
      expect(lastLogLine()).toMatch(
        new RegExp(
          `^agent-id=${EXIT1_AGENT} playbook=hit name=fallback variant=fallback source=default resolution=none ` +
            `face_id=- version=- hash=- session=sess-2-18-4 injected=yes ms=\\d+ bytes=\\d+$`
        )
      );
    } finally {
      if (saved === '') delete process.env.WOLF_SESSION;
      else process.env.WOLF_SESSION = saved;
    }
  });

  it('none → legacy-поиск с гвардом типа/статуса: proposed отсечены, active-note доставлен', async () => {
    const saved = useIsolatedSession();
    try {
      execFileMock.mockClear();
      const plugin = await WolfPlaybookPlugin.server();
      const output = makeSystemOutput(`agent-id: ${GUARD_AGENT}\n\nТы — агент с legacy-памятью.`);
      await plugin['experimental.chat.system.transform']({}, output);

      expect(playbookParts(output)).toHaveLength(1);
      expect(playbookParts(output)[0]).toContain(ACTIVE_NOTE.body);
      expect(playbookParts(output)[0]).not.toContain('must never inject');
      expect(lastLogLine()).toMatch(
        new RegExp(
          `^agent-id=${GUARD_AGENT} playbook=hit name=${ACTIVE_NOTE_ID} variant=legacy source=legacy resolution=none ` +
            `face_id=- version=n1 hash=- session=sess-2-18-4 injected=yes ms=\\d+ bytes=\\d+$`
        )
      );
    } finally {
      if (saved === '') delete process.env.WOLF_SESSION;
      else process.env.WOLF_SESSION = saved;
    }
  });
});
