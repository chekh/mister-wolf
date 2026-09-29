import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { analyticsCommand } from '../../../src/adapters/cli/commands/analytics.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { createCliContainer } from '../../../src/bootstrap/container.js';

// P221 §6.5: окна состояния — effectiveness и dashboard как значения --view.
// Команда зовётся напрямую через parseAsync (без регистрации в cli-entry),
// baseDir инъектится tmp-каталогом — в .wolf репозитория ничего не пишется
// (прецедент: memory-learn.test.ts).
describe('analytics --view effectiveness / dashboard (P221)', () => {
  let dir: string;
  let logs: string[];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-analytics-views-'));
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    // 1-2 объекта памяти: непустой store → честные (не нулевые) блоки панели
    const c = createCliContainer(dir);
    await addMemoryObject(
      { store: c.store, log: c.log, clock: c.clock, idGen: c.idGen, declarations: c.declarations },
      { type: 'decision', title: 'fixture decision', body: 'body', createdBy: 'user:test' }
    );
    await addMemoryObject(
      { store: c.store, log: c.log, clock: c.clock, idGen: c.idGen, declarations: c.declarations },
      { type: 'decision', title: 'another decision', body: 'body', createdBy: 'user:test' }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function run(args: string[]): Promise<void> {
    // from:'user' — argv содержит только аргументы пользователя, без префикса node/script
    return analyticsCommand(dir).parseAsync(args, { from: 'user' });
  }

  it('--view effectiveness: текстовая панель с блоками rules/noise + thresholds', async () => {
    await run(['--view', 'effectiveness']);
    const out = logs.join('\n');
    expect(out).toContain('rules:');
    expect(out).toContain('noise:');
    expect(out).toContain('thresholds:');
  });

  it('--view dashboard: три секции health/ledgers/trends', async () => {
    await run(['--view', 'dashboard']);
    const out = logs.join('\n');
    expect(out).toContain('== health ==');
    expect(out).toContain('== ledgers ==');
    expect(out).toContain('== trends ==');
  });

  it('--view effectiveness --json: парсится, поля rules/tools/delivery/noise/totals', async () => {
    await run(['--view', 'effectiveness', '--json']);
    const parsed = JSON.parse(logs.join('\n')) as Record<string, unknown>;
    expect(parsed).toHaveProperty('rules');
    expect(parsed).toHaveProperty('tools');
    expect(parsed).toHaveProperty('delivery');
    expect(parsed).toHaveProperty('noise');
    expect(parsed).toHaveProperty('totals');
  });

  it('--view effectiveness --snapshot: файл снапшотов появился; следующий вызов печатает дельту', async () => {
    await run(['--view', 'effectiveness', '--snapshot']);
    expect(logs.some((l) => l.includes('snapshot appended'))).toBe(true);
    expect(existsSync(join(dir, '.wolf', 'metrics', 'effectiveness-snapshots.jsonl'))).toBe(true);

    logs = [];
    await run(['--view', 'effectiveness']);
    expect(logs.some((l) => l.startsWith('delta vs'))).toBe(true);
  });

  it('--view dashboard --json: структура {generatedAt, effectiveness, analytics, snapshot}', async () => {
    await run(['--view', 'dashboard', '--json']);
    const parsed = JSON.parse(logs.join('\n')) as Record<string, unknown>;
    expect(parsed).toHaveProperty('generatedAt');
    expect(parsed).toHaveProperty('effectiveness');
    expect(parsed).toHaveProperty('analytics');
    expect(parsed).toHaveProperty('snapshot');
  });
});
