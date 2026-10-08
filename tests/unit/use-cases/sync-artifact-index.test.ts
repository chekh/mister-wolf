import { describe, it, expect } from 'vitest';
import { join, isAbsolute } from 'path';
import { syncArtifactIndex } from '../../../src/app/use-cases/sync-artifact-index.js';

/** fs-двойник: Map файлов + имена записей каталога docs/dev (папки фич И wave-файлы). */
function memFs(initial: Record<string, string> = {}, devEntries: string[] = [], hasDevDir = true) {
  const files = new Map<string, string>(
    Object.entries(initial).map(([k, v]) => [isAbsolute(k) ? k : join('/p', k), v])
  );
  const writes: string[] = [];
  const fs = {
    exists: async (p: string) =>
      files.has(p) ||
      (hasDevDir && p === join('/p', 'docs/dev')) ||
      devEntries.some((e) => p === join('/p', 'docs/dev', e) || p.startsWith(join('/p', 'docs/dev', e) + '/')),
    readFile: async (p: string) => files.get(p) ?? null,
    writeFile: async (p: string, c: string) => {
      writes.push(p);
      files.set(p, c);
    },
    listDir: async (p: string) => (p === join('/p', 'docs/dev') ? devEntries : []),
    listFiles: async (p: string) =>
      [...files.keys()].filter((f) => f.startsWith(p + '/')).map((f) => f.slice((p + '/').length)),
  };
  return { fs, files, writes };
}

const REQ = (slug: string, title: string) =>
  `---\nslug: ${slug}\ntitle: ${title}\nstatus: draft\ncreated: 2026-10-08\n---\n\n# ${title}\n`;

describe('syncArtifactIndex', () => {
  it('generates INDEX.md from feature folders and wave files', async () => {
    const m = memFs(
      {
        [join('/p', 'docs/dev/2026-10-08-demo/requirements.md')]: REQ('demo', 'Demo'),
        [join('/p', 'docs/dev/2026-10-08-demo/design.md')]:
          '---\nslug: demo\ntitle: Demo — дизайн\nstatus: draft\ncreated: 2026-10-08\n---\n',
        [join('/p', 'docs/dev/2026-10-08-demo/test-plan.md')]:
          '---\nslug: demo\ntitle: Demo — тест-план\nstatus: draft\ncreated: 2026-10-08\n---\n',
        [join('/p', 'docs/dev/wave-2.15.md')]:
          '---\nslug: wave-2.15\ntitle: Волна 2.15\nstatus: active\ncreated: 2026-10-08\n---\n',
      },
      ['2026-10-08-demo', 'wave-2.15.md']
    );
    const res = await syncArtifactIndex({ fs: m.fs as never, baseDir: '/p' });
    expect(res.action).toBe('written');
    const idx = m.files.get(join('/p', 'docs/dev/INDEX.md')) ?? '';
    expect(idx).toContain('| demo | 2026-10-08 | Demo | draft | full |');
    expect(idx).toContain('wave-2.15.md');
  });

  it('fix profile labeled by file set', async () => {
    const m = memFs({ [join('/p', 'docs/dev/2026-10-08-hf/requirements.md')]: REQ('hf', 'Hotfix') }, ['2026-10-08-hf']);
    await syncArtifactIndex({ fs: m.fs as never, baseDir: '/p' });
    expect(m.files.get(join('/p', 'docs/dev/INDEX.md'))).toContain('| hf | 2026-10-08 | Hotfix | draft | fix |');
  });

  it('unchanged content is not rewritten (idempotent)', async () => {
    const m = memFs({ 'docs/dev/2026-10-08-demo/requirements.md': REQ('demo', 'Demo') }, [
      '2026-10-08-demo',
      'INDEX.md',
    ]);
    await syncArtifactIndex({ fs: m.fs as never, baseDir: '/p' });
    const before = m.files.get(join('/p', 'docs/dev/INDEX.md'));
    const res = await syncArtifactIndex({ fs: m.fs as never, baseDir: '/p' });
    expect(res.action).toBe('unchanged');
    expect(m.files.get(join('/p', 'docs/dev/INDEX.md'))).toBe(before);
    // INDEX.md не попадает в секцию «Волны» даже присутствуя в каталоге
    expect(m.files.get(join('/p', 'docs/dev/INDEX.md'))).not.toContain('INDEX.md — INDEX.md');
  });

  it('parts subfolders get _index.md', async () => {
    const m = memFs(
      {
        [join('/p', 'docs/dev/2026-10-08-demo/design/A-storage.md')]: '# A: storage\n',
        [join('/p', 'docs/dev/2026-10-08-demo/requirements.md')]: REQ('demo', 'Demo'),
      },
      ['2026-10-08-demo']
    );
    await syncArtifactIndex({ fs: m.fs as never, baseDir: '/p' });
    const parts = m.files.get(join('/p', 'docs/dev/2026-10-08-demo/design/_index.md')) ?? '';
    expect(parts).toContain('- A-storage.md');
  });

  it('no docs/dev — skipped silently', async () => {
    const m = memFs({}, [], false);
    const res = await syncArtifactIndex({ fs: m.fs as never, baseDir: '/p' });
    expect(res.action).toBe('skipped');
    expect(m.files.has(join('/p', 'docs/dev/INDEX.md'))).toBe(false);
  });
});
