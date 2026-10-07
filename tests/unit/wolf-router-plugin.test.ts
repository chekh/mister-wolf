import { describe, it, expect, vi } from 'vitest';
import { readFileSync, rmSync } from 'fs';
// Плагин — plain ESM TS вне tsconfig (tsc tests не компилирует); vitest/esbuild
// импортирует без тайпчека. CLI-спавн замокан (fixture-playbook): тест не зависит
// ни от .wolf/-памяти репо (gitignored, есть только на дев-машине), ни от dist.
const ROUTER_LOG = '/tmp/wolf-router-plugin-test/router.log';
const SKILL_LOG = '/tmp/wolf-router-plugin-test/skill-invocations.jsonl';
const { execFileMock } = vi.hoisted(() => {
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
  const TTL_PLAYBOOK = {
    id: TTL_PLAYBOOK_ID,
    type: 'playbook',
    owner_skill: TTL_AGENT,
    version: 'v1',
    body: '# ttl probe body',
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
  const SEARCH_HITS: Record<string, string> = {
    apprentice: `${PLAYBOOK_ID} [playbook] # Apprentice playbook\n`,
    'worker-reviewer': `${WORKER_PLAYBOOK_ID} [playbook] # Worker reviewer playbook\n`,
    [TTL_AGENT]: `${TTL_PLAYBOOK_ID} [playbook] # TTL probe\n`,
    // два кандидата, ОБА проходят гвард владельца (проба раннего стопа)
    [STOP_AGENT]: `${STOP_A_ID} [playbook] # A\n${STOP_B_ID} [playbook] # B\n`,
    [ENV_AGENT]: `${ENV_PLAYBOOK_ID} [playbook] # env probe\n`,
  };
  const GET_OBJECTS: Record<string, object> = {
    [PLAYBOOK_ID]: PLAYBOOK,
    [WORKER_PLAYBOOK_ID]: WORKER_PLAYBOOK,
    [TTL_PLAYBOOK_ID]: TTL_PLAYBOOK,
    [STOP_A_ID]: STOP_A,
    [STOP_B_ID]: STOP_B,
    [ENV_PLAYBOOK_ID]: ENV_PLAYBOOK,
  };
  // promisify(execFile) без custom-symbol → стандартный callback-контракт.
  const execFileMock = vi.fn((file: unknown, args: string[], opts: unknown, cb?: unknown) => {
    const done = (typeof opts === 'function' ? opts : cb) as
      | ((err: Error | null, res?: { stdout: string }) => void)
      | undefined;
    if (!done) throw new Error('execFile: callback not found');
    const sub = args?.[1];
    if (sub === 'search') return done(null, { stdout: SEARCH_HITS[args[2]] ?? '' });
    if (sub === 'get') {
      const obj = GET_OBJECTS[args[2]];
      if (obj) return done(null, { stdout: JSON.stringify(obj) });
    }
    return done(new Error(`unexpected CLI call: ${JSON.stringify(args)}`));
  });
  return { execFileMock };
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
      /^agent-id=worker-reviewer playbook=hit name=mem_fixture_playbook_worker_v1 variant=canonical injected=yes ms=\d+ bytes=\d+$/
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
      /^agent-id=apprentice playbook=hit name=mem_fixture_playbook_v4 variant=canonical injected=yes ms=\d+ bytes=\d+$/
    );
  });

  // T012: miss-ветки больше нет — fallback логируется как hit variant=fallback
  it('fallback: router.log line playbook=hit name=fallback variant=fallback injected=yes', async () => {
    const plugin = await WolfPlaybookPlugin.server();
    const output = makeSystemOutput('agent-id: net-takogo-2-xyz\n\nТы — неизвестный агент.');
    await plugin['experimental.chat.system.transform']({}, output);

    expect(lastLogLine()).toMatch(
      /^agent-id=net-takogo-2-xyz playbook=hit name=fallback variant=fallback injected=yes ms=\d+ bytes=\d+$/
    );
  });
});

describe('P106: TTL 5 мин / ранний стоп / негативный кэш / ms-bytes / WOLF_SESSION / skill-метрика', () => {
  // (а) TTL 5 минут: между 2.5с (старый TTL) и 5мин — кэш обязан жить
  it('TTL: respawn только после 5 мин, не после 2.5с', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      execFileMock.mockClear();
      const plugin = await WolfPlaybookPlugin.server();
      const transform = plugin['experimental.chat.system.transform'];
      const out1 = makeSystemOutput('agent-id: ttl-probe-p106\n\nТы — проба TTL.');
      await transform({}, out1);
      expect(playbookParts(out1)).toHaveLength(1);
      const afterFirst = execFileMock.mock.calls.length;
      expect(afterFirst).toBeGreaterThan(0);

      vi.advanceTimersByTime(4 * 60_000); // 4 мин < TTL 5 мин
      const out2 = makeSystemOutput('agent-id: ttl-probe-p106\n\nТы — проба TTL.');
      await transform({}, out2);
      expect(execFileMock.mock.calls.length).toBe(afterFirst); // кэш жив, спавнов нет
      expect(playbookParts(out2)).toHaveLength(1);

      vi.advanceTimersByTime(6 * 60_000); // 10 мин от первого → TTL истёк
      const out3 = makeSystemOutput('agent-id: ttl-probe-p106\n\nТы — проба TTL.');
      await transform({}, out3);
      expect(execFileMock.mock.calls.length).toBeGreaterThan(afterFirst); // respawn был
      expect(playbookParts(out3)).toHaveLength(1);
    } finally {
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

  // негативный кэш: null кэшируется тем же TTL — повторный miss без спавнов
  it('negative cache: miss → только search (0 get); повтор → ноль новых спавнов', async () => {
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
    expect(execFileMock.mock.calls.length).toBe(afterFirst); // null из кэша, спавнов нет
    expect(playbookParts(out2)).toHaveLength(1);
  });

  // (в) ms=/bytes= в router.log — отдельная явная проверка полей
  it('router.log: canonical и fallback строки несут ms=<n> bytes=<n>, bytes > 0', async () => {
    const plugin = await WolfPlaybookPlugin.server();
    const transform = plugin['experimental.chat.system.transform'];

    await transform({}, makeSystemOutput('agent-id: apprentice\n\nТы — аналитик-подмастерье.'));
    expect(lastLogLine()).toMatch(
      /^agent-id=apprentice playbook=hit name=\S+ variant=canonical injected=yes ms=\d+ bytes=\d+$/
    );
    expect(Number(lastLogLine().match(/bytes=(\d+)/)?.[1])).toBeGreaterThan(0);

    await transform({}, makeSystemOutput('agent-id: net-takogo-3-xyz\n\nТы — неизвестный агент.'));
    expect(lastLogLine()).toMatch(
      /^agent-id=net-takogo-3-xyz playbook=hit name=fallback variant=fallback injected=yes ms=\d+ bytes=\d+$/
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
