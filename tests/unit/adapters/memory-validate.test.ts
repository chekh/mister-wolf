import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { runValidate } from '../../../src/adapters/cli/commands/memory-validate.js';
import { generateCoreConfigBlock } from '../../../src/domain/taxonomy.js';
import { getWolfVersion } from '../../../src/adapters/version.js';
import { initProjectMemory } from '../../../src/app/use-cases/init-project-memory.js';
import { FsProjectInitializer } from '../../../src/adapters/fs/fs-project-initializer.js';

// P214 (спека 2.13 §7 C7): taxonomy-секция validate — легаси-дамп drift-чекается
// против канона как раньше; новый формат (wolf_version-штамп без дампа) даёт
// warning при несовпадении с версией бинарья, taxonomy остаётся OK.
describe('P214: validate taxonomy — легаси-дамп + wolf_version-штамп', () => {
  let dir: string;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-validate-p214-'));
    await initProjectMemory(new FsProjectInitializer(), dir); // пустой проект валиден
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function writeConfig(content: Record<string, unknown>): void {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), yaml.dump(content));
  }

  function taxonomySection(result: Awaited<ReturnType<typeof runValidate>>) {
    const s = result.sections.find((x) => x.name === 'taxonomy');
    expect(s).toBeDefined();
    return s!;
  }

  it('легаси-дамп ≠ канон → ошибка drift', async () => {
    writeConfig({ memory_types: { core: { decision: { lifecycle: ['active'] } } } });
    const result = await runValidate(dir);
    expect(taxonomySection(result).errors).toContain('core block drifted from code canon; run: wolf taxonomy sync');
    expect(result.ok).toBe(false);
    expect(result.displayLines.join('\n')).toContain('taxonomy:   FAIL');
  });

  it('легаси-дамп = канон → без drift-ошибки', async () => {
    writeConfig({ memory_types: { core: generateCoreConfigBlock() } });
    const result = await runValidate(dir);
    expect(taxonomySection(result).errors).toEqual([]);
    expect(result.displayLines.join('\n')).toContain('taxonomy:   OK');
  });

  it('штамп wolf_version ≠ версия бинарья → warning, taxonomy OK (C7)', async () => {
    writeConfig({ wolf_version: '0.0.1', artifact_sources: [] });
    const result = await runValidate(dir);
    const tax = taxonomySection(result);
    expect(tax.errors).toEqual([]);
    expect(tax.warnings.some((w) => w.includes('wolf migrate taxonomy'))).toBe(true);
    expect(result.ok).toBe(true); // warning, не error
    expect(result.displayLines.join('\n')).toContain(`taxonomy:   OK (wolf_version 0.0.1 != wolf ${getWolfVersion()}`);
  });

  it('штамп wolf_version = версия бинарья → чисто', async () => {
    writeConfig({ wolf_version: getWolfVersion(), artifact_sources: [] });
    const result = await runValidate(dir);
    const tax = taxonomySection(result);
    expect(tax.errors).toEqual([]);
    expect(tax.warnings).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
