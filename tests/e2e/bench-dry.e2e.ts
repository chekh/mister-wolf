import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, repoRoot } from './helpers.js';

/**
 * E2E dry-режим A/B-бенчмарков: каждый скрипт запускается с --dry из корня репо.
 * Dry НЕ зовёт opencode (LLM-прогоны подменены fixture-NDJSON) — зелёный даже
 * без opencode в окружении. Ассерты только за механику: exit 0, таблица,
 * «Итог:», FAIL=0, JSON-отчёт в .wolf/bench (каталог в .gitignore, чистим за собой).
 */
const scripts = [
  ['b1-repeat-debug', 'b1-repeat-debug.sh'],
  ['b2-bootstrap', 'b2-bootstrap.sh'],
  ['b3-retrospective', 'b3-retrospective.sh'],
] as const;

describe('bench scripts --dry', () => {
  beforeAll(() => {
    ensureBuilt();
  });

  it.each(scripts)('%s: exit 0, таблица, FAIL=0, отчёт создан', (name, file) => {
    const result = spawnSync('bash', [join(repoRoot, 'scripts', 'bench', file), '--dry'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(result.stderr || '').not.toMatch(/--live запрещён|ОТКАЗ/);
    expect(result.status, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('| метрика');
    expect(result.stdout).toContain('Итог:');
    expect(result.stdout).toContain('FAIL=0');
    expect(existsSync(join(repoRoot, '.wolf', 'bench', `${name}.json`))).toBe(true);
  });

  afterAll(() => {
    // отчёты лежат в .gitignored .wolf/bench, но чистим за собой точечно
    for (const [name] of scripts) {
      rmSync(join(repoRoot, '.wolf', 'bench', `${name}.json`), { force: true });
    }
  });
});
