// 2.32.0 (Q1): english slug от агента-создателя доходит до генератора ID на
// живом CLI-пути; отсутствие/невалидность slug даёт fallback без слов и
// предупреждение, а не транслитерацию русского заголовка.
import { describe, it, expect } from 'vitest';
import { runCli, tmpProject } from './helpers.js';

const init = (cwd: string): void => {
  const res = runCli(['init', '--full', '--yes'], cwd);
  expect(res.status, res.stderr).toBe(0);
};

describe('wolf add --slug (2.32.0)', () => {
  it('S14: валидный slug → ID с английским slug', () => {
    const cwd = tmpProject();
    init(cwd);
    const res = runCli(
      ['add', '--type', 'note', '--facet', 'howto', '--title', 'Как обновлять проект', '--slug', 'how-to-update'],
      cwd
    );
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/Created memory object: mem_\d{8}_how-to-update_[0-9a-f]{6}/);
  });

  it('S14: без --slug → ID без слов и без транслитерации', () => {
    const cwd = tmpProject();
    init(cwd);
    const res = runCli(['add', '--type', 'note', '--facet', 'howto', '--title', 'Как обновлять проект'], cwd);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/Created memory object: mem_\d{8}_[0-9a-f]{6}\b/);
    expect(res.stdout).not.toMatch(/kak_obnovlyat/);
  });

  it('S14: кириллица в --slug → fallback + видимое предупреждение', () => {
    const cwd = tmpProject();
    init(cwd);
    const res = runCli(
      ['add', '--type', 'note', '--facet', 'howto', '--title', 'Обновление', '--slug', 'обновление'],
      cwd
    );
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/Created memory object: mem_\d{8}_[0-9a-f]{6}\b/);
    expect(res.stderr).toMatch(/not an English slug/);
  });
});
