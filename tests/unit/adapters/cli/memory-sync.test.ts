// tests/unit/adapters/cli/memory-sync.test.ts
// Волна 2.17 T-06 (design §Затронутые модули п.8): сообщение Стюард-зоны
// в `wolf sync` указывает на публичный путь мутации лиц — `wolf face *`.
// Юнит-теста memory-sync не существовало — файл новый (минимальный, заявлен
// в отчёте T-06). syncBaseSet/syncArtifactIndex мокаются: прогон не пишет ФС.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { memorySyncCommand } from '../../../../src/adapters/cli/commands/memory-sync.js';

vi.mock('../../../../src/app/use-cases/sync-base-set.js', () => ({
  syncBaseSet: vi.fn(async () => ({ outcomes: [], orphaned: [] })),
}));
vi.mock('../../../../src/app/use-cases/sync-artifact-index.js', () => ({
  syncArtifactIndex: vi.fn(async () => ({ action: 'skipped' as const })),
}));

describe('wolf sync: Стюард-зона указывает на wolf face * (2.17 T-06)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('финальная строка упоминает Steward zone и wolf face *', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.join(' '));
    });
    await memorySyncCommand().parseAsync([], { from: 'user' });
    expect(lines.length).toBeGreaterThan(0);
    const last = lines[lines.length - 1]!;
    expect(last).toContain('Steward zone');
    expect(last).toContain('wolf face *');
    expect(last).not.toContain('playbook mutations');
  });
});
