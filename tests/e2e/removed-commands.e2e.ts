import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

// Спека 2.13 §10.4 (диета C1/C2/C3/C5/C15/C16): удалённые команды без синонимов
// отвечают ошибкой с подсказкой (exit ≠ 0 + stderr), а не глухой unknown-command.
// Механизм: exitOverride в cli-entry + карта src/adapters/cli/removed-commands.ts.

const REMOVED: ReadonlyArray<{ argv: string[]; name: string }> = [
  { argv: ['run', 'do something'], name: 'run' },
  { argv: ['coord'], name: 'coord' },
  { argv: ['memory-stage', '--stage', 'injected', '--memory-ids', 'mem_x'], name: 'memory-stage' },
  { argv: ['learn', 'status'], name: 'learn' },
  { argv: ['learn', 'digest'], name: 'learn' },
  { argv: ['council', 'tally'], name: 'council' },
  { argv: ['session', 'checkpoint', '--thread', 'thr_x'], name: 'checkpoint' },
  { argv: ['help', 'learn'], name: 'learn' },
];

describe('removed commands answer with a migration hint (wave 2.13 diet)', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // памяти не нужно: unknown-command падает до схемо-гуарда и экшенов команд
  it.each(REMOVED)('wolf $name -> exit!=0 + stderr hint ($#)', ({ argv, name }) => {
    const dir = tmpProject();
    dirs.push(dir);
    const res = runCli(argv, dir);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain(`command '${name}' was removed in wolf 2.13`);
    expect(res.stderr).toContain('See CHANGELOG (Migration section)');
  });
});
