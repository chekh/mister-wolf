import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  SESSION_TTL_MS,
  checksumBlock,
  deliveryWarningLine,
  isDelivered,
  loadSessionRegistry,
  recordDeliveries,
} from '../../../src/adapters/fs/session-delivery-registry.js';

describe('session-delivery-registry (P108, спека 4.C)', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'wolf-sdr-'));
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  const sessions = () => join(baseDir, '.wolf', 'cache', 'sessions');
  const registryFile = (key: string) => join(sessions(), `${key}.json`);

  it('checksumBlock: sha256 → 16 hex, стабилен и различает текст', () => {
    expect(checksumBlock('abc')).toMatch(/^[0-9a-f]{16}$/);
    expect(checksumBlock('abc')).toBe(checksumBlock('abc'));
    expect(checksumBlock('abd')).not.toBe(checksumBlock('abc'));
  });

  it('запись + чтение: checksum записывается, injectedBytes растёт на сумму bytes', () => {
    recordDeliveries(baseDir, 's1', [
      { id: 'mem_1', checksum: 'aaaa1111aaaa1111', bytes: 100 },
      { id: 'mem_2', checksum: 'bbbb2222bbbb2222', bytes: 50 },
    ]);
    const reg = loadSessionRegistry(baseDir, 's1');
    expect(reg.delivered['mem_1']).toBe('aaaa1111aaaa1111');
    expect(reg.delivered['mem_2']).toBe('bbbb2222bbbb2222');
    expect(reg.injectedBytes).toBe(150);
    expect(isDelivered(reg, 'mem_1', 'aaaa1111aaaa1111')).toBe(true);
    expect(isDelivered(reg, 'mem_1', 'ffff0000ffff0000')).toBe(false);
    expect(isDelivered(reg, 'mem_absent', 'aaaa1111aaaa1111')).toBe(false);

    recordDeliveries(baseDir, 's1', [{ id: 'mem_3', checksum: 'cccc3333cccc3333', bytes: 10 }]);
    expect(loadSessionRegistry(baseDir, 's1').injectedBytes).toBe(160);
  });

  it('checksum-обновление: тот же id с другой checksum → перезапись, инъекция снова «новая»', () => {
    recordDeliveries(baseDir, 's2', [{ id: 'mem_1', checksum: 'aaaa1111aaaa1111', bytes: 100 }]);
    recordDeliveries(baseDir, 's2', [{ id: 'mem_1', checksum: 'dddd4444dddd4444', bytes: 120 }]);
    const reg = loadSessionRegistry(baseDir, 's2');
    expect(reg.delivered['mem_1']).toBe('dddd4444dddd4444');
    expect(isDelivered(reg, 'mem_1', 'aaaa1111aaaa1111')).toBe(false);
    expect(reg.injectedBytes).toBe(220);
  });

  it('отсутствующий реестр → пустой (нет дедупликации — поведение 2.11)', () => {
    const reg = loadSessionRegistry(baseDir, 'never');
    expect(reg.delivered).toEqual({});
    expect(reg.injectedBytes).toBe(0);
  });

  it('битый JSON → штатно: пустой реестр, перезапись лечит файл', () => {
    mkdirSync(sessions(), { recursive: true });
    writeFileSync(registryFile('broken'), '{not json');
    const reg = loadSessionRegistry(baseDir, 'broken');
    expect(reg.delivered).toEqual({});
    expect(reg.injectedBytes).toBe(0);

    recordDeliveries(baseDir, 'broken', [{ id: 'mem_x', checksum: 'eeee5555eeee5555', bytes: 7 }]);
    const healed = loadSessionRegistry(baseDir, 'broken');
    expect(healed.delivered['mem_x']).toBe('eeee5555eeee5555');
    expect(healed.injectedBytes).toBe(7);
    expect(JSON.parse(readFileSync(registryFile('broken'), 'utf8')).delivered.mem_x).toBe('eeee5555eeee5555');
  });

  it('GC при чтении: *.json старше 7 дней удаляется, свежий живёт', () => {
    mkdirSync(sessions(), { recursive: true });
    const old = registryFile('old');
    const fresh = registryFile('fresh');
    writeFileSync(old, '{}');
    writeFileSync(fresh, '{}');
    const staleTime = new Date(Date.now() - SESSION_TTL_MS - 60_000);
    utimesSync(old, staleTime, staleTime);

    loadSessionRegistry(baseDir, 'any');
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });

  it('GC при записи: recordDeliveries тоже выметает просроченные файлы', () => {
    mkdirSync(sessions(), { recursive: true });
    const old = registryFile('old2');
    writeFileSync(old, '{}');
    const staleTime = new Date(Date.now() - SESSION_TTL_MS - 1000);
    utimesSync(old, staleTime, staleTime);

    recordDeliveries(baseDir, 's3', [{ id: 'mem_1', checksum: 'aaaa1111aaaa1111', bytes: 1 }]);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(registryFile('s3'))).toBe(true);
  });
});

// P109 (4.D): мягкий лимит контекста — чистая функция предупреждения.
describe('deliveryWarningLine (P109, спека 4.D)', () => {
  const DEFAULTS = { contextBudgetTokens: 200_000, contextWarningPct: 20 };

  it('порог не пересечён → null', () => {
    // 20% от 200k токенов = 40k токенов = 160k байт; меньше — молчим
    expect(deliveryWarningLine(159_999, DEFAULTS)).toBeNull();
  });

  it('ровно на пороге → null (строгий >)', () => {
    expect(deliveryWarningLine(160_000, DEFAULTS)).toBeNull();
  });

  it('порог пересечён → строка с числами (bytes / бюджет, bytes/4-аппроксимация)', () => {
    const line = deliveryWarningLine(400_000, DEFAULTS); // 100k токенов = 50%
    expect(line).toContain('~50%');
    expect(line).toContain('400000 bytes / 200000 tokens');
    expect(line).toContain('20%');
    expect(line).toContain('[wolf]');
  });

  it('context_warning_pct = 0 → предупреждение выключено', () => {
    expect(deliveryWarningLine(10_000_000, { contextBudgetTokens: 200_000, contextWarningPct: 0 })).toBeNull();
  });
});
