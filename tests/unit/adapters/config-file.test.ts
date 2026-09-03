import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadWolfConfigSync, renderConfigYaml } from '../../../src/adapters/fs/config-file.js';

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
