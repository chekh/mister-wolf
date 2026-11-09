// tests/unit/adapters/cli/memory-scaffold.test.ts
// S-DELIVERY W2 (3.0.0): лог scaffold честен — без плейбука строки
// «Created playbook: undefined» нет, печатается только рамка; с плейбуком — обе.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../src/app/use-cases/scaffold-agent.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/use-cases/scaffold-agent.js')>();
  return { ...actual, scaffoldFrame: vi.fn() };
});
vi.mock('../../../../src/bootstrap/container.js', () => ({
  createCliContainer: () => ({
    store: {},
    log: {},
    clock: {},
    idGen: {},
    index: undefined,
    relations: undefined,
    declarations: undefined,
    fs: {},
    lock: undefined,
  }),
}));
vi.mock('../../../../src/adapters/fs/session-metrics-log.js', () => ({
  appendDeliverySignal: vi.fn(async () => {}),
}));

import { memoryScaffoldCommand } from '../../../../src/adapters/cli/commands/memory-scaffold.js';
import { scaffoldFrame } from '../../../../src/app/use-cases/scaffold-agent.js';
import { appendDeliverySignal } from '../../../../src/adapters/fs/session-metrics-log.js';

let logged: string[] = [];

beforeEach(() => {
  logged = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logged.push(args.join(' '));
  });
  vi.mocked(scaffoldFrame).mockReset();
  vi.mocked(appendDeliverySignal).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scaffold CLI-лог (S-DELIVERY W2: честный вывод рамки)', () => {
  it('без playbookId — только Created frame, без «Created playbook: undefined»', async () => {
    vi.mocked(scaffoldFrame).mockResolvedValue({
      playbookId: undefined,
      ownerSkill: 'alpha',
      framePath: '.opencode/agents/alpha.md',
    });
    await memoryScaffoldCommand().parseAsync(['agent', 'alpha', '--persona', 'test body'], { from: 'user' });
    const text = logged.join('\n');
    expect(text).toContain('Created frame: .opencode/agents/alpha.md');
    expect(text).not.toContain('Created playbook');
  });

  it('с playbookId — обе строки: playbook и frame', async () => {
    vi.mocked(scaffoldFrame).mockResolvedValue({
      playbookId: 'pb_abc123',
      ownerSkill: 'alpha',
      framePath: '.opencode/agents/alpha.md',
    });
    await memoryScaffoldCommand().parseAsync(['agent', 'alpha', '--from-playbook', 'pb_abc123'], { from: 'user' });
    const text = logged.join('\n');
    expect(text).toContain('Created playbook: pb_abc123');
    expect(text).toContain('Created frame: .opencode/agents/alpha.md');
    expect(appendDeliverySignal).toHaveBeenCalledTimes(1);
  });
});
