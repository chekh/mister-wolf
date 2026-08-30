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
