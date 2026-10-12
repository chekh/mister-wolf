// D-1..D-6 (test-plan волны 2.16.2): detectPlatformMismatch — несоответствие
// «установлено под v1, рантайм v2» по записям wolf-sync-state с cross-check штампа.
// Oracle: design.md §C2, ADR-1 (DUAL_SINCE='2.14.1', однонаправленность детекта).
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { detectPlatformMismatch, type MismatchDeps } from '../../../src/app/use-cases/platform-mismatch.js';

describe('detectPlatformMismatch (REQ-02, design §C2)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-mismatch-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const pluginRel = '.opencode/plugins/wolf-router.ts';
  const writeState = (set: string) => {
    mkdirSync(join(dir, '.opencode/plugins'), { recursive: true });
    writeFileSync(join(dir, pluginRel), `// wolf:rendered base=wolf-router.ts set=${set}\nexport {}\n`);
    writeFileSync(
      join(dir, '.opencode/wolf-sync-state.json'),
      JSON.stringify({ files: { [pluginRel]: 'x' } }, null, 2)
    );
  };

  const deps = (runtime: MismatchDeps['runtime']): MismatchDeps => ({
    baseDir: dir,
    runtime,
    readSyncState: () => {
      try {
        const parsed = JSON.parse(readFileSync(join(dir, '.opencode/wolf-sync-state.json'), 'utf-8'));
        return { files: parsed.files as Record<string, string> };
      } catch {
        return null; // нет файла или битый JSON → нет свидетельства
      }
    },
    readFile: (abs) => {
      try {
        return readFileSync(abs, 'utf-8');
      } catch {
        return null;
      }
    },
  });
  const v2 = { status: 'v2' as const, version: '2.0.24', raw: 'opencode v2.0.24' };
  const v1 = { status: 'v1' as const, version: '1.18.35', raw: '1.18.35' };

  it('D-1: set=2.14.0 + runtime v2 → mismatch с рекомендацией --repair', async () => {
    writeState('2.14.0');
    const r = await detectPlatformMismatch(deps(() => v2));
    expect(r).not.toBeNull();
    expect(r?.platform).toBe('opencode');
    expect(r?.installedSet).toBe('2.14.0');
    expect(r?.issue).toContain('--repair');
  });

  it('D-2: set=2.14.1 + runtime v2 → null (граница DUAL_SINCE)', async () => {
    writeState('2.14.1');
    expect(await detectPlatformMismatch(deps(() => v2))).toBeNull();
  });

  it('D-3: runtime v1 → null (однонаправленность, F-05)', async () => {
    writeState('2.14.0');
    expect(await detectPlatformMismatch(deps(() => v1))).toBeNull();
  });

  it('D-4: runtime absent → null', async () => {
    writeState('2.14.0');
    expect(await detectPlatformMismatch(deps(() => ({ status: 'absent' })))).toBeNull();
  });

  it('D-5: sync-state отсутствует → null без скана диска', async () => {
    expect(await detectPlatformMismatch(deps(() => v2))).toBeNull();
  });

  it('D-6: запись state есть, штамп на файле отсутствует → запись исключена', async () => {
    mkdirSync(join(dir, '.opencode/plugins'), { recursive: true });
    writeFileSync(join(dir, pluginRel), '// чужой файл без штампа\nexport {}\n');
    writeFileSync(
      join(dir, '.opencode/wolf-sync-state.json'),
      JSON.stringify({ files: { [pluginRel]: 'x' } }, null, 2)
    );
    expect(await detectPlatformMismatch(deps(() => v2))).toBeNull();
  });

  it('D-6b: минимальный set из нескольких плагинов определяет mismatch', async () => {
    writeState('2.16.1');
    const second = '.opencode/plugins/wolf-session-start.js';
    writeFileSync(join(dir, second), `// wolf:rendered base=wolf-session-start.js set=2.14.0\nexport {};\n`);
    const statePath = join(dir, '.opencode/wolf-sync-state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    state.files[second] = 'y';
    writeFileSync(statePath, JSON.stringify(state, null, 2));
    const r = await detectPlatformMismatch(deps(() => v2));
    expect(r?.installedSet).toBe('2.14.0');
  });
});
