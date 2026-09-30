import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadDeliverySettings, loadWolfConfigSync, renderConfigYaml } from '../../../src/adapters/fs/config-file.js';
import type { WolfConfig } from '../../../src/domain/taxonomy.js';
import { getWolfVersion } from '../../../src/adapters/version.js';

// P104 (е): счётчик readFileSync — полная делегация реальному fs, поведение не меняется.
const fsReadFiles = vi.hoisted(() => [] as string[]);
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: ((...args: Parameters<typeof actual.readFileSync>) => {
      fsReadFiles.push(String(args[0]));
      return actual.readFileSync(...args);
    }) as typeof actual.readFileSync,
  };
});

// Ф20/Ф21: taxonomy sync (renderConfigYaml) перегенерирует config.yaml —
// ключи контура самообучения (error_class_taxonomy, learning) обязаны выживать
// в round-trip, иначе sync молча обнулит калибровку классов и порога.
describe('config round-trip: ключи контура Ф20/Ф21 не теряются при regenerate', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-config-rt-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('render → файл → loadWolfConfigSync сохраняет таксономию и порог', () => {
    const rendered = renderConfigYaml({
      artifact_sources: [],
      projectTypes: [],
      rawCoreBlock: null,
      errorClassTaxonomy: [{ id: 'grpc_unavailable', match: ['grpc', 'unavailable'] }],
      learning: { patternThreshold: 2 },
    });
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), rendered);

    const loaded = loadWolfConfigSync(dir);
    expect(loaded?.errorClassTaxonomy).toEqual([{ id: 'grpc_unavailable', match: ['grpc', 'unavailable'] }]);
    expect(loaded?.learning?.patternThreshold).toBe(2);
  });

  it('без ключей контура render не добавляет их (конфиг остаётся чистым)', () => {
    const rendered = renderConfigYaml({ artifact_sources: [], projectTypes: [], rawCoreBlock: null });
    expect(rendered).not.toContain('pattern_threshold: 2');
    expect(rendered).not.toContain('grpc');
  });
});

// E1.2: override порогов панели effectiveness читается из config.yaml;
// битый блок отбрасывается схемой (.catch(undefined)) → дефолты.
describe('config learning.effectiveness_thresholds (E1.2)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-config-eff-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function writeConfig(yaml: string): void {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), yaml);
  }

  it('snake_case-поля маппятся в camelCase, незаданные отсутствуют', () => {
    writeConfig('learning:\n  effectiveness_thresholds:\n    noise_ok: 25\n    silent_ok: 40\n');
    const loaded = loadWolfConfigSync(dir);
    expect(loaded?.learning?.effectivenessThresholds).toEqual({ noiseOk: 25, silentOk: 40 });
  });

  it('битые значения (строка вместо числа) → весь блок undefined → дефолты', () => {
    writeConfig('learning:\n  effectiveness_thresholds:\n    noise_ok: "20"\n');
    const loaded = loadWolfConfigSync(dir);
    expect(loaded?.learning?.effectivenessThresholds).toBeUndefined();
  });

  it('без блока — undefined (дефолты панели)', () => {
    writeConfig('learning:\n  pattern_threshold: 5\n');
    expect(loadWolfConfigSync(dir)?.learning?.effectivenessThresholds).toBeUndefined();
  });
});

// M3: pricing ($/Mtok) + analytics.thresholds (D7) из config.yaml; битые блоки отбрасываются схемой
describe('config pricing + analytics.thresholds (M3)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-config-m3-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function writeConfig(yaml: string): void {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), yaml);
  }

  it('pricing-таблица и analytics.thresholds читаются, пороги маппятся в camelCase', () => {
    writeConfig(
      'pricing:\n' +
        "  'zai-coding-plan/glm-5.3':\n" +
        '    input: 0.6\n' +
        '    output: 2.2\n' +
        '    cache_read: 0.06\n' +
        'analytics:\n' +
        '  thresholds:\n' +
        '    new_days: 14\n' +
        '    workhorse_uses: 3\n'
    );
    const loaded = loadWolfConfigSync(dir);
    expect(loaded?.pricing).toEqual({
      'zai-coding-plan/glm-5.3': { input: 0.6, output: 2.2, cache_read: 0.06 },
    });
    expect(loaded?.analytics?.thresholds).toEqual({ newDays: 14, workhorseUses: 3 });
  });

  it('без блоков — undefined', () => {
    writeConfig('learning:\n  pattern_threshold: 5\n');
    const loaded = loadWolfConfigSync(dir);
    expect(loaded?.pricing).toBeUndefined();
    expect(loaded?.analytics).toBeUndefined();
  });
});

// P104 (A6): мемоизация loadWolfConfigSync по mtime+size — sync-yaml-parse уходит
// с горячего пути телеметрии; изменение файла (stat) инвалидирует кэш.
describe('P104 (A6): мемоизация loadWolfConfigSync по mtime+size', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-config-memo-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function writeConfig(yaml: string): void {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), yaml);
  }
  const configReads = () => fsReadFiles.filter((p) => p === join(dir, '.wolf', 'config.yaml')).length;

  it('(е) два вызова с одним baseDir → один readFileSync; изменение файла → перечитывает', () => {
    writeConfig('learning:\n  pattern_threshold: 25\n');
    const first = loadWolfConfigSync(dir);
    const second = loadWolfConfigSync(dir);
    expect(second?.learning?.patternThreshold).toBe(25);
    expect(first).toBe(second); // мемо — тот же объект без re-parse
    expect(configReads()).toBe(1);
    writeConfig('learning:\n  pattern_threshold: 52\n'); // тот же размер, другое значение — инвалидация по mtime
    expect(loadWolfConfigSync(dir)?.learning?.patternThreshold).toBe(52);
    expect(configReads()).toBe(2);
  });

  it('отсутствующий конфиг → null (кэш «файла нет»); появление файла перечитывает', () => {
    expect(loadWolfConfigSync(dir)).toBeNull();
    expect(configReads()).toBe(0);
    writeConfig('learning:\n  pattern_threshold: 7\n');
    expect(loadWolfConfigSync(dir)?.learning?.patternThreshold).toBe(7);
    expect(configReads()).toBe(1);
  });
});

// 2.13 §5.3: facets.character — закрытый словарь фасетов note (7–10 значений);
// БЕЗ catch: битый блок = громкая ошибка конфига; старые конфиги без ключа читаются (iii).
describe('config facets.character (2.13 §5.3)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-config-facets-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function writeConfig(yaml: string): void {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), yaml);
  }

  it('кастомный словарь 8 значений читается', () => {
    writeConfig('facets:\n  character: [a, b, c, d, e, f, g, h]\n');
    const loaded = loadWolfConfigSync(dir);
    expect(loaded?.facets).toEqual({ character: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] });
  });

  it('словарь из 3 значений → ошибка конфига (диапазон 7–10)', () => {
    writeConfig('facets:\n  character: [a, b, c]\n');
    expect(() => loadWolfConfigSync(dir)).toThrow();
  });

  it('словарь из 11 значений → ошибка конфига', () => {
    writeConfig('facets:\n  character: [a, b, c, d, e, f, g, h, i, j, k]\n');
    expect(() => loadWolfConfigSync(dir)).toThrow();
  });

  it('пустые значения в словаре → ошибка конфига', () => {
    writeConfig('facets:\n  character: [a, b, c, d, e, f, ""]\n');
    expect(() => loadWolfConfigSync(dir)).toThrow();
  });

  it('старый конфиг без ключа facets читается без ошибок (инвариант iii)', () => {
    writeConfig('learning:\n  pattern_threshold: 5\n');
    const loaded = loadWolfConfigSync(dir);
    expect(loaded?.facets).toBeUndefined();
    expect(loaded?.learning?.patternThreshold).toBe(5);
  });
});

// P109 (4.D): delivery.* — мягкий лимит инъекций; отсутствующие/битые ключи = дефолты (§5.iii).
describe('P109 (4.D): loadDeliverySettings — delivery.context_budget_tokens / context_warning_pct', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-config-delivery-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function writeConfig(yaml: string): void {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), yaml);
  }

  it('конфиг без ключей delivery → дефолты 200000/20', () => {
    writeConfig('learning:\n  pattern_threshold: 3\n');
    expect(loadDeliverySettings(dir)).toEqual({ contextBudgetTokens: 200_000, contextWarningPct: 20 });
  });

  it('отсутствующий конфиг → дефолты', () => {
    expect(loadDeliverySettings(dir)).toEqual({ contextBudgetTokens: 200_000, contextWarningPct: 20 });
  });

  it('ключи применяются', () => {
    writeConfig('delivery:\n  context_budget_tokens: 50000\n  context_warning_pct: 5\n');
    expect(loadDeliverySettings(dir)).toEqual({ contextBudgetTokens: 50_000, contextWarningPct: 5 });
  });

  it('битые значения → дефолты (zod catch, §5.iii)', () => {
    writeConfig('delivery:\n  context_budget_tokens: -1\n  context_warning_pct: not-a-number\n');
    expect(loadDeliverySettings(dir)).toEqual({ contextBudgetTokens: 200_000, contextWarningPct: 20 });
  });

  it('0 выключает предупреждение', () => {
    writeConfig('delivery:\n  context_warning_pct: 0\n');
    expect(loadDeliverySettings(dir).contextWarningPct).toBe(0);
  });
});

// P214 (спека 2.13 §7 C7+C8): wolf_version-штамп вместо дампа memory_types.core
// (~570 строк) + полный round-trip конфига (фикс M8 — regenerate больше не теряет
// pricing/analytics/learning.decay_ttl/effectiveness_thresholds/facets/delivery).
describe('P214: wolf_version-штамп + round-trip', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-config-p214-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function writeConfig(yaml: string): void {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), yaml);
  }

  const fullConfig: WolfConfig = {
    artifact_sources: ['src/**/*.ts'],
    schemaVersion: 2,
    wolfVersion: '0.0.1', // рендер игнорирует и штампует версию бинарья
    projectTypes: [
      {
        name: 'task_brief',
        lifecycle: ['active', 'completed', 'paused'],
        subdirThread: 'tasks',
        subdirShared: null,
        fields: { executor: { kind: 'string', optional: true } },
      },
    ],
    rawCoreBlock: null,
    errorClassTaxonomy: [{ id: 'grpc_unavailable', match: ['grpc', 'unavailable'] }],
    learning: {
      patternThreshold: 3,
      decayTtl: { decision: 10 },
      effectivenessThresholds: { noiseOk: 25, noiseWarn: 60, silentOk: 40 },
    },
    pricing: { 'zai-coding-plan/glm-5.3': { input: 0.6, output: 2.2, cache_read: 0.06 } },
    analytics: { thresholds: { newDays: 14, workhorseUses: 3 } },
    facets: { character: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
    delivery: { contextBudgetTokens: 150_000, contextWarningPct: 15 },
  };

  it('дефолт: renderConfigYaml(null) ≤40 строк, wolf_version есть, memory_types нет', () => {
    const rendered = renderConfigYaml(null);
    expect(rendered.split('\n').filter((l) => l.trim() !== '').length).toBeLessThanOrEqual(40);
    expect(rendered).toContain('wolf_version:');
    expect(rendered).not.toContain('memory_types'); // проектных типов нет → секции нет вовсе
  });

  it('golden round-trip без потерь + стабильность render(load(render(cfg)))', () => {
    const rendered = renderConfigYaml(fullConfig);
    writeConfig(rendered);
    const loaded = loadWolfConfigSync(dir);
    expect(loaded?.wolfVersion).toBe(getWolfVersion()); // штамп = версия бинарья
    expect(loaded?.artifact_sources).toEqual(fullConfig.artifact_sources);
    expect(loaded?.schemaVersion).toBe(fullConfig.schemaVersion);
    expect(loaded?.projectTypes).toEqual(fullConfig.projectTypes);
    expect(loaded?.errorClassTaxonomy).toEqual(fullConfig.errorClassTaxonomy);
    expect(loaded?.learning).toEqual(fullConfig.learning);
    expect(loaded?.pricing).toEqual(fullConfig.pricing);
    expect(loaded?.analytics).toEqual(fullConfig.analytics);
    expect(loaded?.facets).toEqual(fullConfig.facets);
    expect(loaded?.delivery).toEqual(fullConfig.delivery);
    // стабильность: повторный рендер загруженного байт-в-байт совпадает
    expect(renderConfigYaml(loaded)).toBe(rendered);
  });

  it('легаси-конфиг с дампом: парсится, rawCoreBlock не null, мусорный ключ stripped, wolfVersion undefined', () => {
    writeConfig(
      'memory_types:\n' +
        '  core:\n' +
        '    decision:\n' +
        '      lifecycle: [active]\n' +
        'learning:\n' +
        '  pattern_threshold: 3\n' +
        '  evolve_route: true\n'
    );
    const loaded = loadWolfConfigSync(dir);
    expect(loaded).not.toBeNull();
    expect(loaded?.rawCoreBlock).toEqual({ decision: { lifecycle: ['active'] } });
    expect(loaded?.wolfVersion).toBeUndefined();
    expect(loaded?.learning?.patternThreshold).toBe(3);
    expect(JSON.stringify(loaded?.learning)).not.toContain('evolve_route'); // zod-strip
  });

  it('аддитивная замена: легаси-дамп → рендер без core, project type и pricing выживают', () => {
    writeConfig(
      'memory_types:\n' +
        '  core:\n' +
        '    decision:\n' +
        '      lifecycle: [active]\n' +
        '  project:\n' +
        '    task_brief:\n' +
        '      lifecycle: [active, completed, paused]\n' +
        '      subdir_thread: tasks\n' +
        '      subdir_shared: ~\n' +
        '      fields:\n        executor: { kind: string, optional: true }\n' +
        'pricing:\n' +
        "  'zai-coding-plan/glm-5.3':\n" +
        '    input: 0.6\n' +
        '    output: 2.2\n' +
        '    cache_read: 0.06\n'
    );
    const loaded = loadWolfConfigSync(dir);
    const rendered = renderConfigYaml(loaded);
    expect(rendered).toContain('wolf_version:');
    expect(rendered).not.toContain('core:');
    writeConfig(rendered);
    const reloaded = loadWolfConfigSync(dir);
    expect(reloaded?.rawCoreBlock).toBeNull(); // дамп не переживает regenerate
    expect(reloaded?.projectTypes).toEqual(fullConfig.projectTypes);
    expect(reloaded?.pricing).toEqual(fullConfig.pricing);
  });
});
