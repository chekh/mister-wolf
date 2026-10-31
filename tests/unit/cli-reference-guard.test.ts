import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * P224 (спека 2.13 §6.6/§10.2): guard «справочник == реестр». Файл
 * docs/reference/cli.md обязан быть побитово равен свежесгенерированному
 * из реестра commander выводу scripts/generate-cli-reference.mjs.
 * Расхождение = реестр (или справочник) изменился без регенерации.
 */
describe('guard: docs/reference/cli.md is generated from the CLI registry (P224)', () => {
  // Генерация спавнит полный реестр commander (~25s на нагруженной машине) —
  // дефолтный testTimeout 5s даёт стабильный флейк в полном прогоне.
  it('file on disk equals regenerated reference', { timeout: 120_000 }, async () => {
    const { generateReference } = await import('../../scripts/generate-cli-reference.mjs');
    const expected = await generateReference();
    const onDisk = readFileSync(join(process.cwd(), 'docs/reference/cli.md'), 'utf8');
    expect(onDisk, 'drift detected — run: node scripts/generate-cli-reference.mjs').toBe(expected);
  });

  // Регрессия 2.23.0: значение по умолчанию, разрешённое в абсолютный домашний
  // путь, делало справочник машинно-зависимым — guard выше падал только на CI.
  it('reference carries no absolute home path (portable across machines)', () => {
    const onDisk = readFileSync(join(process.cwd(), 'docs/reference/cli.md'), 'utf8');
    const home = homedir();
    expect(home.length).toBeGreaterThan(1);
    expect(onDisk.includes(home), `absolute home path ${home} leaked into the reference`).toBe(false);
  });
});
