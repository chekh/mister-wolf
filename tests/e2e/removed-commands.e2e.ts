import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

// Спека 2.13 §10.4 (диета C1/C2/C3/C5/C15/C16): удалённые команды без синонимов
// отвечают ошибкой с подсказкой (exit ≠ 0 + stderr), а не глухой unknown-command.
// Механизм: exitOverride в cli-entry + карта src/adapters/cli/removed-commands.ts.
// P222 §6.2: смерть create — `<type> create` → подсказка на `add --type <type>`;
// топ-уровневые старые типы (info-request/blocker/article) → подсказка на note-путь.

interface RemovedCase {
  argv: string[];
  /** Строки, которые обязан содержать stderr (дефолт — «command '<name>' was removed»). */
  expect?: string[];
}

const REMOVED: ReadonlyArray<RemovedCase & { name: string }> = [
  { argv: ['run', 'do something'], name: 'run' },
  { argv: ['coord'], name: 'coord' },
  { argv: ['memory-stage', '--stage', 'injected', '--memory-ids', 'mem_x'], name: 'memory-stage' },
  { argv: ['learn', 'status'], name: 'learn' },
  { argv: ['learn', 'digest'], name: 'learn' },
  { argv: ['council', 'tally'], name: 'council' },
  { argv: ['session', 'checkpoint', '--thread', 'thr_x'], name: 'checkpoint' },
  { argv: ['help', 'learn'], name: 'learn' },
  // §6.2 P222: `<type> create` у type-неймспейсов
  {
    argv: ['thread', 'create', '--title', 'x'],
    name: 'create',
    expect: ["command 'thread create' was removed", 'use `wolf add --type thread`'],
  },
  {
    argv: ['decision', 'create'],
    name: 'create',
    expect: ["command 'decision create' was removed", 'use `wolf add --type decision`'],
  },
  {
    argv: ['note', 'create'],
    name: 'create',
    expect: ['use `wolf add --type note`'],
  },
  // §6.2/§5.4 P222: топ-уровневые старые имена типов → note-путь
  {
    argv: ['info-request', 'create', '--title', 'x'],
    name: 'info-request',
    expect: ['use `add --type note --facet context`'],
  },
  {
    argv: ['blocker', 'add', '--title', 'x'],
    name: 'blocker',
    expect: ['use `add --type note --facet pitfall`'],
  },
  {
    argv: ['article', 'list'],
    name: 'article',
    expect: ['use `add --type note --facet context`'],
  },
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
  it.each(REMOVED)('wolf $name -> exit!=0 + stderr hint ($#)', ({ argv, name, expect: expected }) => {
    const dir = tmpProject();
    dirs.push(dir);
    const res = runCli(argv, dir);
    expect(res.status).not.toBe(0);
    const wanted = expected ?? [`command '${name}' was removed in wolf 2.13`];
    for (const line of wanted) {
      expect(res.stderr).toContain(line);
    }
    expect(res.stderr).toContain('See CHANGELOG (Migration section)');
  });
});
