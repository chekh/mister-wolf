import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * P224 (спека 2.13 §6.6/§10.2): guard «справочник == реестр». Файл
 * docs/reference/cli.md обязан быть побитово равен свежесгенерированному
 * из реестра commander выводу scripts/generate-cli-reference.mjs.
 * Расхождение = реестр (или справочник) изменился без регенерации.
 */
describe('guard: docs/reference/cli.md is generated from the CLI registry (P224)', () => {
  it('file on disk equals regenerated reference', async () => {
    const { generateReference } = await import('../../scripts/generate-cli-reference.mjs');
    const expected = await generateReference();
    const onDisk = readFileSync(join(process.cwd(), 'docs/reference/cli.md'), 'utf8');
    expect(onDisk, 'drift detected — run: node scripts/generate-cli-reference.mjs').toBe(expected);
  });
});
