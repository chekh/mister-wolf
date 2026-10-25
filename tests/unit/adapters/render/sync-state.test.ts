// tests/unit/adapters/render/sync-state.test.ts
// NFR-04 + ADR-8 (design §4.2, §4.17): свидетель помнит происхождение записи
// (`render` | `keep`) и базу, легаси-строки 2.19.0 нормализуются при чтении,
// запись атомарна (tmp+rename, без `*.tmp` после), key-only потребители
// (platform-mismatch, memory-doctor, uninstall) объектную форму не ломают.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadSyncState,
  saveSyncState,
  sha256,
  type SyncEntry,
  type SyncStateFiles,
} from '../../../../src/adapters/render/sync-state.js';
import { detectPlatformMismatch } from '../../../../src/app/use-cases/platform-mismatch.js';
import { planUninstall } from '../../../../src/app/use-cases/uninstall.js';

const STATE = '.opencode/wolf-sync-state.json';
const dirs: string[] = [];

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wolf-sync-state-'));
  dirs.push(dir);
  return dir;
}

function writeState(dir: string, files: Record<string, unknown>): void {
  mkdirSync(join(dir, '.opencode'), { recursive: true });
  writeFileSync(join(dir, STATE), `${JSON.stringify({ files }, null, 2)}\n`);
}

const stamped = (set: string): string => `---\ntitle: x\n---\n<!-- wolf:rendered base=a.md set=${set} -->\nbody\n`;

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('loadSyncState — чтение и нормализация легаси', () => {
  it('строка 2.19.0 → {hash, origin:render, base} из штампа файла', () => {
    const dir = project();
    writeState(dir, { '.opencode/agents/a.md': 'abc' });
    mkdirSync(join(dir, '.opencode/agents'), { recursive: true });
    writeFileSync(join(dir, '.opencode/agents/a.md'), stamped('2.17.0'));
    expect(loadSyncState(dir).files['.opencode/agents/a.md']).toEqual({
      hash: 'abc',
      origin: 'render',
      base: '2.17.0',
    });
  });

  it('строка без файла/штампа → base 0.0.0', () => {
    const dir = project();
    writeState(dir, { '.opencode/agents/gone.md': 'dead', '.opencode/agents/b.md': 'beef' });
    mkdirSync(join(dir, '.opencode/agents'), { recursive: true });
    writeFileSync(join(dir, '.opencode/agents/b.md'), '---\ntitle: x\n---\nbody\n');
    const files = loadSyncState(dir).files;
    expect(files['.opencode/agents/gone.md']).toEqual({ hash: 'dead', origin: 'render', base: '0.0.0' });
    expect(files['.opencode/agents/b.md']).toEqual({ hash: 'beef', origin: 'render', base: '0.0.0' });
  });

  it('объектная запись читается как есть (origin keep сохраняется)', () => {
    const dir = project();
    writeState(dir, { '.opencode/agents/a.md': { hash: 'abc', origin: 'keep', base: '2.19.0' } });
    expect(loadSyncState(dir).files['.opencode/agents/a.md']).toEqual({
      hash: 'abc',
      origin: 'keep',
      base: '2.19.0',
    });
  });

  it('битые записи не роняют чтение (толерантность сохраняется)', () => {
    const dir = project();
    writeState(dir, { '.opencode/agents/a.md': 42, '.opencode/agents/b.md': { origin: 'x' } });
    expect(loadSyncState(dir).files).toEqual({});
  });

  it('нет файла / битый JSON → пустое состояние', () => {
    const dir = project();
    expect(loadSyncState(dir)).toEqual({ files: {} });
    mkdirSync(join(dir, '.opencode'), { recursive: true });
    writeFileSync(join(dir, STATE), '{not json');
    expect(loadSyncState(dir)).toEqual({ files: {} });
  });

  it('чтение не переписывает файл состояния (миграция — при первой записи)', () => {
    const dir = project();
    writeState(dir, { '.opencode/agents/a.md': 'abc' });
    const before = readFileSync(join(dir, STATE), 'utf-8');
    loadSyncState(dir);
    expect(readFileSync(join(dir, STATE), 'utf-8')).toBe(before);
  });
});

describe('saveSyncState — запись', () => {
  it('round-trip: полная запись {hash, origin, base} сохраняется и читается', () => {
    const dir = project();
    const entry: SyncEntry = { hash: sha256('body'), origin: 'keep', base: '2.20.0' };
    saveSyncState(dir, { files: { '.opencode/agents/a.md': entry } });
    expect(loadSyncState(dir).files['.opencode/agents/a.md']).toEqual(entry);
    const raw = JSON.parse(readFileSync(join(dir, STATE), 'utf-8')) as { files: Record<string, SyncEntry> };
    expect(raw.files['.opencode/agents/a.md']).toEqual(entry);
  });

  it('атомарность: после записи в каталоге нет *.tmp, файл парсится', () => {
    const dir = project();
    saveSyncState(dir, { files: { 'a.md': { hash: 'h', origin: 'render', base: '2.20.0' } } });
    expect(readdirSync(join(dir, '.opencode')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(() => JSON.parse(readFileSync(join(dir, STATE), 'utf-8'))).not.toThrow();
  });

  it('формат файла: JSON с отступом 2 и финальным переводом строки', () => {
    const dir = project();
    saveSyncState(dir, { files: {} });
    expect(readFileSync(join(dir, STATE), 'utf-8')).toBe(`${JSON.stringify({ files: {} }, null, 2)}\n`);
  });
});

describe('key-only потребители объектной формы (ADR-8)', () => {
  /** Сырой JSON свидетеля — ровно то, что читают production-пути
   *  (`loadSyncStateFiles`/`memory-uninstall`), без нормализации `loadSyncState`. */
  const rawStateFiles = (dir: string): SyncStateFiles =>
    (JSON.parse(readFileSync(join(dir, STATE), 'utf-8')) as { files: SyncStateFiles }).files;

  it('detectPlatformMismatch на сыром JSON: объект + легаси-строка (platform-mismatch + memory-doctor)', async () => {
    const dir = project();
    writeState(dir, {
      '.opencode/plugins/p.ts': { hash: 'h', origin: 'render', base: '2.13.0' },
      '.opencode/agents/legacy.md': 'abc', // легаси-запись 2.19.0 в том же файле
    });
    mkdirSync(join(dir, '.opencode/plugins'), { recursive: true });
    writeFileSync(join(dir, '.opencode/plugins/p.ts'), '// wolf:rendered base=p.ts set=2.13.0\n');
    const found = await detectPlatformMismatch({
      baseDir: dir,
      runtime: () => ({ status: 'v2' }) as never,
      readSyncState: () => ({ files: rawStateFiles(dir) }),
      readFile: (p) => (existsSync(p) ? readFileSync(p, 'utf-8') : null),
    });
    expect(found?.installedSet).toBe('2.13.0');
  });

  it('planUninstall на сыром JSON: объект + легаси-строка перечислены по ключам', async () => {
    const dir = project();
    writeState(dir, {
      '.opencode/agents/a.md': { hash: 'h', origin: 'render', base: '2.20.0' },
      '.opencode/agents/legacy.md': 'abc',
    });
    mkdirSync(join(dir, '.opencode/agents'), { recursive: true });
    writeFileSync(join(dir, '.opencode/agents/a.md'), stamped('2.20.0'));
    writeFileSync(join(dir, '.opencode/agents/legacy.md'), stamped('2.19.0'));
    const plan = await planUninstall({
      baseDir: dir,
      syncStateFiles: () => rawStateFiles(dir),
      readFile: (p) => (existsSync(p) ? readFileSync(p, 'utf-8') : null),
      exists: existsSync,
      listFiles: () => [],
      listDirs: () => [],
      removeFile: async () => {},
      removeDirIfEmpty: async () => false,
      removeTree: async () => {},
      adapters: [],
    });
    expect(plan.entries.map((e) => `${e.kind}:${e.target}`)).toContain('file:.opencode/agents/a.md');
    expect(plan.entries.map((e) => `${e.kind}:${e.target}`)).toContain('file:.opencode/agents/legacy.md');
    expect(plan.entries.map((e) => e.target)).toContain(STATE);
  });
});
