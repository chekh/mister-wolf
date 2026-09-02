import { spawn } from 'child_process';
import { realpathSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Command } from 'commander';
import { runUpgrade, type UpgradeDeps, type UpgradeOutcome } from '../../../app/use-cases/upgrade.js';
import { UserFacingError } from '../../../domain/errors.js';

// wolf upgrade (бриф 2026-09-02): npm-самообновление глобальной установки.
// spawn npm идёт через PATH — e2e подменяет npm фейком первой записью PATH,
// реальный registry в тестах не дёргается.

function readInstalledVersion(): string {
  // dist/adapters/cli/commands/ → корень пакета (package.json в tarball-е рядом с dist/)
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(baseDir, '../../../../package.json'), 'utf-8')) as {
    version: string;
  };
  return pkg.version;
}

function realPathOrNull(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

interface NpmResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function npmBin(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runNpm(args: string[], inheritStdio = false): Promise<NpmResult> {
  return new Promise((resolve, reject) => {
    // ветвление вместо условных опций: TS не выводит перегрузку spawn по union-stdio
    const child = inheritStdio
      ? spawn(npmBin(), args, { stdio: ['ignore', 'inherit', 'inherit'] })
      : spawn(npmBin(), args);
    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', (d) => (stdout += d));
    if (child.stderr) child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject); // npm не найден и пр.
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

async function registryVersion(): Promise<string> {
  const res = await runNpm(['view', 'mister-wolf', 'version']);
  const version = res.stdout.trim();
  if (res.code !== 0 || version === '') {
    const detail = res.stderr.trim() !== '' ? `: ${res.stderr.trim()}` : '';
    throw new UserFacingError(`не удалось получить версию из npm registry${detail}`);
  }
  return version;
}

async function npmGlobalPrefix(): Promise<string | null> {
  try {
    const res = await runNpm(['prefix', '-g']);
    const p = res.stdout.trim();
    return res.code === 0 && p !== '' ? realPathOrNull(p) : null;
  } catch {
    return null; // npm недоступен — тип установки не проверить (фолбэк = отказ)
  }
}

async function installLatest(from: string, to: string): Promise<void> {
  console.log(`${from} → ${to}`);
  const res = await runNpm(['install', '-g', 'mister-wolf@latest'], true);
  if (res.code !== 0) {
    throw new UserFacingError('npm install -g mister-wolf@latest завершился с ошибкой (вывод npm выше)');
  }
}

function printOutcome(outcome: UpgradeOutcome): void {
  switch (outcome.kind) {
    case 'up-to-date':
      console.log(`уже последняя версия (${outcome.current})`);
      return;
    case 'local-newer':
      console.log(
        `установленная ${outcome.current} новее версии в registry (${outcome.latest}) — обновление не требуется`
      );
      return;
    case 'available':
      console.log(`доступна ${outcome.latest} (установлена ${outcome.current}) — запустите wolf upgrade`);
      return;
    case 'updated':
      console.log('обновлено; новая версия wolf вступит в силу при следующем запуске');
      return;
    case 'linked-refusal':
      throw new UserFacingError(
        `установлена dev/linked-копия (${outcome.binaryPath ?? 'путь неизвестен'}) — upgrade неприменим; для обновления: npm rm -g mister-wolf && npm i -g mister-wolf`
      );
  }
}

export function memoryUpgradeCommand(): Command {
  return new Command('upgrade')
    .description(
      'Upgrade the global wolf installation to the latest npm version (runs npm install -g mister-wolf@latest); --check only compares versions, no install'
    )
    .option('--check', 'Only check for a newer version, do not install anything')
    .action(async (options: { check?: boolean }) => {
      const checkOnly = options.check === true;
      const deps: UpgradeDeps = {
        currentVersion: readInstalledVersion(),
        binaryPath: process.argv[1] ? realPathOrNull(process.argv[1]) : null,
        npmPrefix: checkOnly ? null : await npmGlobalPrefix(), // --check тип установки не проверяет
        registryVersion,
        installLatest,
      };
      printOutcome(await runUpgrade(deps, checkOnly));
    });
}
