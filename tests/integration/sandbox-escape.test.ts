import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

// F26 (sandbox escape): изоляция на XDG_CONFIG_HOME не транзитивна — дочерний
// процесс со сконструированным env теряет переменные песочницы и ДО фикса писал
// в живой ~/.config/wolf (getpwuid-канал). Тест гоняет глубину ≥2:
// test → tests/fixtures/escape-child.mjs → dist/bootstrap/cli.js.
// Все запуски — с явно сконструированным env (WOLF_SANDBOX или HOME-мок): живой
// реестр не трогаем ни в красной, ни в зелёной фазе.

const ROOT = process.cwd();
const RUNNER = join(ROOT, 'tests/fixtures/escape-child.mjs');

/** Собранная сборка поддерживает маркер WOLF_SANDBOX (после фикса F26)? */
function sandboxMarkerSupported(): boolean {
  try {
    return readFileSync(join(ROOT, 'dist/adapters/fs/user-config.js'), 'utf-8').includes('WOLF_SANDBOX');
  } catch {
    return false;
  }
}

describe('F26 sandbox escape: wolf CLI in grandchild process with constructed env', () => {
  it('WOLF_SANDBOX marker routes the registry into the sandbox, not into HOME', () => {
    const base = mkdtempSync(join(tmpdir(), 'f26-escape-'));
    try {
      const sandbox = join(base, 'sandbox');
      const mockHome = join(base, 'mockhome');
      const project = join(base, 'proj');
      mkdirSync(sandbox);
      mkdirSync(mockHome);
      mkdirSync(project);
      writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'f26-escape-proj', version: '0.0.0' }));

      // Runner передаёт env: WOLF_SANDBOX=sandbox, HOME=mockHome, XDG НЕТ.
      const r = spawnSync(process.execPath, [RUNNER, 'sandbox', project, sandbox, mockHome], {
        encoding: 'utf-8',
      });
      expect(r.status).toBe(0);

      expect(existsSync(join(sandbox, '.config', 'wolf', 'projects.yaml'))).toBe(true);
      expect(existsSync(join(mockHome, '.config', 'wolf', 'projects.yaml'))).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  // Кейс ДО фикса не запускается (стоп-кран 2): неизвестный коду маркер был бы
  // проигнорирован, а env без XDG/HOME ушёл бы в живой реестр. Пропуск честный —
  // по отсутствию WOLF_SANDBOX в собранном dist.
  describe.skipIf(!sandboxMarkerSupported())('WOLF_SANDBOX pointing to nonexistent root', () => {
    it('CLI exits non-zero with explicit WOLF_SANDBOX refusal', () => {
      const base = mkdtempSync(join(tmpdir(), 'f26-badsandbox-'));
      try {
        const sandbox = join(base, 'sandbox'); // НЕ создаём — внутри runner возьмёт <sandbox>/nonexistent
        const mockHome = join(base, 'mockhome');
        const project = join(base, 'proj');
        mkdirSync(mockHome);
        mkdirSync(project);
        writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'f26-bad-proj', version: '0.0.0' }));

        const r = spawnSync(process.execPath, [RUNNER, 'bad-sandbox', project, sandbox, mockHome], {
          encoding: 'utf-8',
        });
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain('WOLF_SANDBOX');
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    });
  });
});
