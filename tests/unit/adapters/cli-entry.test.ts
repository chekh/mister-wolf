import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { safeCwd, createCli, runCli } from '../../../src/adapters/cli/cli-entry.js';
import { UserFacingError } from '../../../src/domain/errors.js';

/** Общее состояние моков P101: счётчики загрузок модулей/фабрик, гард, порядок событий. */
const state = vi.hoisted(() => ({
  getModuleLoads: 0,
  getFactories: 0,
  addModuleLoads: 0,
  getAction: null as { id: string; opts: Record<string, unknown> } | null,
  addAction: null as { title: string } | null,
  initActionRan: false,
  guardCalls: 0,
  order: [] as string[],
}));

// P101: командные модули должны импортироваться ТОЛЬКО лениво (внутри action стаба).
// Счётчик moduleLoads инкрементируется в factory vi.mock — при первом import() модуля.
vi.mock('../../../src/adapters/cli/commands/memory-get.js', () => {
  state.getModuleLoads++;
  return {
    memoryGetCommand: () => {
      state.getFactories++;
      return new Command('get')
        .description('Get a memory object by id')
        .argument('<id>', 'Memory object id')
        .option('--json', 'JSON output')
        .allowUnknownOption()
        .action((id: string, opts: Record<string, unknown>) => {
          state.getAction = { id, opts };
          state.order.push('get-action');
        });
    },
  };
});

vi.mock('../../../src/adapters/cli/commands/memory-add.js', () => {
  state.addModuleLoads++;
  return {
    memoryAddCommand: () =>
      new Command('add')
        .description('Add a memory object')
        .option('--title <title>', 'Title')
        .allowUnknownOption()
        .action((opts: Record<string, unknown>) => {
          state.addAction = { title: String(opts.title) };
          state.order.push('add-action');
        }),
  };
});

vi.mock('../../../src/adapters/cli/commands/memory-init.js', () => ({
  memoryInitCommand: () =>
    new Command('init')
      .description('Initialize Mr. Wolf memory for this project')
      .option('--recreate', 'Recreate config')
      .allowUnknownOption()
      .action(() => {
        state.initActionRan = true;
        state.order.push('init-action');
      }),
}));

vi.mock('../../../src/adapters/fs/schema-guard.js', () => ({
  ensureCurrentSchema: vi.fn(async () => {
    state.guardCalls++;
    state.order.push('guard');
    return 'ok' as const;
  }),
}));

describe('safeCwd (F13: удалённый cwd → ENOENT uv_cwd)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('в норме возвращает process.cwd()', () => {
    expect(safeCwd()).toBe(process.cwd());
  });

  it('при ENOENT из process.cwd() бросает UserFacingError с однострочным сообщением', () => {
    vi.spyOn(process, 'cwd').mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory, uv_cwd');
    });
    try {
      safeCwd();
      expect.unreachable('safeCwd должен был бросить UserFacingError');
    } catch (err) {
      expect(err).toBeInstanceOf(UserFacingError);
      expect((err as UserFacingError).message).toContain('current directory does not exist');
    }
  });
});

describe('P101: ленивая регистрация команд', () => {
  let realArgv: string[];

  beforeEach(() => {
    realArgv = process.argv;
    state.getAction = null;
    state.addAction = null;
    state.initActionRan = false;
    state.order = [];
  });

  afterEach(() => {
    process.argv = realArgv;
    vi.restoreAllMocks();
  });

  it('createCli() не грузит командные модули', () => {
    const before = state.getModuleLoads;
    createCli();
    expect(state.getModuleLoads).toBe(before);
  });

  it('парсинг top-level --help не грузит командные модули', async () => {
    const before = state.getModuleLoads;
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await createCli().parseAsync(['node', 'cli.js', '--help']);
    expect(state.getModuleLoads).toBe(before);
  });

  it('выполнение команды грузит модуль ровно один раз (кэш import) и делегирует argv', async () => {
    const loadsBefore = state.getModuleLoads;
    const factoriesBefore = state.getFactories;
    process.argv = ['node', 'cli.js', 'get', 'mem_1', '--json'];
    await runCli(process.argv);
    expect(state.getAction).toEqual({ id: 'mem_1', opts: { json: true } });

    // второй вызов — модуль из кэша (loads не растёт), фабрика вызывается заново
    state.getAction = null;
    process.argv = ['node', 'cli.js', 'get', 'mem_2'];
    await runCli(process.argv);
    expect(state.getAction).toEqual({ id: 'mem_2', opts: {} });
    expect(state.getModuleLoads - loadsBefore).toBe(1);
    expect(state.getFactories - factoriesBefore).toBe(2);
  });

  it('делегирование сохраняет значение опции с пробелами (add --title "x y")', async () => {
    process.argv = ['node', 'cli.js', 'add', '--title', 'x y'];
    await runCli(process.argv);
    expect(state.addAction).toEqual({ title: 'x y' });
    expect(state.addModuleLoads).toBeGreaterThan(0);
  });

  it('wolf help <cmd> печатает полный хелп реальной команды (не стаб)', async () => {
    const chunks: string[] = [];
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(process.stdout, 'write').mockImplementation((c: string | Uint8Array) => {
      chunks.push(String(c));
      return true;
    });
    process.argv = ['node', 'cli.js', 'help', 'get'];
    await runCli(process.argv);
    const out = chunks.join('');
    // секции Arguments/Options есть только у реальной команды, у стаба их нет
    expect(out).toContain('Memory object id');
    expect(out).toContain('--json');
  });
});

describe('P101: schema-guard платится только выбранной командой (preAction)', () => {
  let realArgv: string[];

  beforeEach(() => {
    realArgv = process.argv;
    state.order = [];
    state.initActionRan = false;
  });

  afterEach(() => {
    process.argv = realArgv;
    vi.restoreAllMocks();
  });

  /** --version/--help печатают вывод и зовут exit: гасим, парсинг завершается штатно. */
  function silenceVersionHelp(): void {
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  }

  it('--version не платит гард и не грузит команды', async () => {
    const guardsBefore = state.guardCalls;
    const loadsBefore = state.getModuleLoads;
    silenceVersionHelp();
    await runCli(['node', 'cli.js', '--version']);
    expect(state.guardCalls).toBe(guardsBefore);
    expect(state.getModuleLoads).toBe(loadsBefore);
  });

  it('top-level --help не платит гард', async () => {
    const guardsBefore = state.guardCalls;
    silenceVersionHelp();
    await runCli(['node', 'cli.js', '--help']);
    expect(state.guardCalls).toBe(guardsBefore);
  });

  it('команда платит гард ДО своих side-effects', async () => {
    process.argv = ['node', 'cli.js', 'get', 'mem_1'];
    await runCli(process.argv);
    expect(state.order).toEqual(['guard', 'get-action']);
  });

  it('init --recreate обходит гард (спека §6: путь восстановления)', async () => {
    const guardsBefore = state.guardCalls;
    process.argv = ['node', 'cli.js', 'init', '--recreate'];
    await runCli(process.argv);
    expect(state.guardCalls).toBe(guardsBefore);
    expect(state.initActionRan).toBe(true);
  });
});
