import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanUnregistered } from '../../../src/app/use-cases/scan-unregistered.js';

let tmp: string | undefined;
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function makeTmp(): string {
  tmp = mkdtempSync(join(tmpdir(), 'wolf-scan-'));
  return tmp;
}

/** Живой проект `<parent>/<name>/.wolf/memory`; activityMs — mtime маркера активности (events.jsonl или памяти). */
function makeProject(parent: string, name: string, activityMs?: number, events = true): string {
  const dir = join(parent, name);
  mkdirSync(join(dir, '.wolf', 'memory'), { recursive: true });
  const marker = events ? join(dir, '.wolf', 'events.jsonl') : join(dir, '.wolf', 'memory');
  if (events) writeFileSync(marker, '{}\n');
  if (activityMs !== undefined) {
    const t = new Date(activityMs);
    utimesSync(marker, t, t);
  }
  return dir;
}

describe('scanUnregistered (REQ-09)', () => {
  it('R09.1: 13 живых вне реестра → found=13, топ-5 свежими первыми, hint, входной реестр не изменён', async () => {
    const root = makeTmp();
    const freshest: string[] = [];
    for (let i = 0; i < 13; i++) {
      const dir = makeProject(root, `p${String(i).padStart(2, '0')}`, 1_000_000 + i * 1000);
      if (i >= 8) freshest.push(dir);
    }
    const registeredPaths = ['/definitely/not/registered'];
    const result = await scanUnregistered({ root, registeredPaths });
    expect(result).not.toBeNull();
    expect(result!.found).toBe(13);
    expect(result!.top).toEqual(freshest.slice().reverse());
    expect(result!.hint).toBe(
      'found 13 projects with wolf memory outside the registry; running any wolf command in a project registers it (self-healing)'
    );
    expect(registeredPaths).toEqual(['/definitely/not/registered']);
  });

  it('R09.2: живых нет → null', async () => {
    const root = makeTmp();
    mkdirSync(join(root, 'empty-project'), { recursive: true }); // каталоги есть, памятей нет
    expect(await scanUnregistered({ root, registeredPaths: [] })).toBeNull();
  });

  it('R09.2: недоступный root → null, не throw', async () => {
    const root = join(makeTmp(), 'missing');
    await expect(scanUnregistered({ root, registeredPaths: [] })).resolves.toBeNull();
  });

  it('зарегистрированный realpath (в т.ч. symlink-алиас) исключается; несуществующий registered-путь не роняет скан', async () => {
    const root = makeTmp();
    const a = makeProject(root, 'a', 1_000_000);
    const b = makeProject(root, 'b', 2_000_000);
    const alias = join(root, 'alias');
    symlinkSync(a, alias); // registered-путь — symlink на 'a': realpath-нормализация должна свернуть их
    const result = await scanUnregistered({ root, registeredPaths: [alias, join(root, 'ghost')] });
    expect(result!.found).toBe(1);
    expect(result!.top).toEqual([b]);
  });

  it('бюджет: мягкая остановка по budgetMs (инжект now), частичный результат, не hang и не throw', async () => {
    const root = makeTmp();
    makeProject(root, 'at-root', 1); // обрабатывается до любых остановок
    for (let i = 0; i < 5; i++) makeProject(root, `p${i}`, 1_000 + i);
    let clock = 0;
    const result = await scanUnregistered({
      root,
      registeredPaths: [],
      budgetMs: 2500,
      now: () => (clock += 1000), // каждая проверка времени — +1 с
    });
    expect(result).not.toBeNull();
    expect(result!.found).toBeGreaterThanOrEqual(1);
    expect(result!.found).toBeLessThan(6);
  });

  it('maxDepth 4: проект на глубине 4 находится, на глубине 5 — нет', async () => {
    const root = makeTmp();
    const found4 = makeProject(join(root, 'a', 'b', 'c'), 'proj4', 1_000_000); // root/a/b/c/proj4 — глубина 4
    makeProject(join(root, 'a', 'b', 'c', 'd'), 'proj5', 2_000_000); // root/a/b/c/d/proj5 — глубина 5
    const result = await scanUnregistered({ root, registeredPaths: [] });
    expect(result!.found).toBe(1);
    expect(result!.top).toEqual([found4]);
  });

  it('сортировка по давности: mtime events.jsonl, fallback — mtime .wolf/memory', async () => {
    const root = makeTmp();
    const withEvents = makeProject(root, 'with-events', 2_000_000, true);
    const noEvents = makeProject(root, 'no-events', 3_000_000, false); // память свежее events соседа — должен быть первым
    const result = await scanUnregistered({ root, registeredPaths: [] });
    expect(result!.top).toEqual([noEvents, withEvents]);
  });
});
