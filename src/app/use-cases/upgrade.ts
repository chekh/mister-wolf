import { sep } from 'path';

// wolf upgrade (бриф 2026-09-02, 2.2.0): самообновление глобальной npm-установки.
// Логика здесь чистая и покрыта unit-тестами; весь spawn npm — за DI-швом
// (адаптер в memory-upgrade.ts), e2e подменяет npm фейком через PATH.

export interface UpgradeDeps {
  /** Версия установленного бинаря (package.json). */
  currentVersion: string;
  /** realpath запущенного скрипта (process.argv[1]); null = не резолвится. */
  binaryPath: string | null;
  /** realpath `npm prefix -g`; null = npm недоступен/ошибка → тип установки не проверить. */
  npmPrefix: string | null;
  /** `npm view mister-wolf version` — кидает при ошибке registry. */
  registryVersion: () => Promise<string>;
  /** `npm install -g mister-wolf@latest` (стримит вывод); кидает при сбое npm. */
  installLatest: (from: string, to: string) => Promise<void>;
}

export type UpgradeOutcome =
  | { kind: 'up-to-date'; current: string }
  | { kind: 'available'; current: string; latest: string }
  | { kind: 'local-newer'; current: string; latest: string }
  | { kind: 'updated'; from: string; to: string }
  | { kind: 'linked-refusal'; binaryPath: string | null };

/** Семвер-сравнение X.Y.Z[-pre]: -1 (a<b) | 0 | 1 (a>b). Непарсибл-токен = 0. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

function parseVersion(v: string): [number, number, number] {
  // npm view может вернуть с 'v'-префиксом; пре-релижную часть игнорируем:
  // пре-релиз ниже релиза того же триплета — достаточно вычесть 1 с патча не выйдет,
  // поэтому трактуем пре-релиз как тот же триплет (консервативно: не «новее»)
  const m = v.trim().replace(/^v/, '').split('-')[0].split('.');
  const n = (i: number): number => {
    const x = Number.parseInt(m[i] ?? '0', 10);
    return Number.isNaN(x) ? 0 : x;
  };
  return [n(0), n(1), n(2)];
}

/** Глобальная npm-установка = realpath бинаря внутри realpath-префикса.
 *  null на любом конце = проверка невозможна → false (безопасный отказ, tested-фолбэк). */
export function isUnderGlobalPrefix(binaryPath: string | null, npmPrefix: string | null): boolean {
  if (!binaryPath || !npmPrefix) return false;
  return binaryPath === npmPrefix || binaryPath.startsWith(npmPrefix + sep);
}

export async function runUpgrade(deps: UpgradeDeps, checkOnly: boolean): Promise<UpgradeOutcome> {
  // install-путь применим только к глобальной установке: dev/linked-копия
  // (npm link, запуск из репо) — честный отказ; `--check` read-only, работает всегда
  if (!checkOnly && !isUnderGlobalPrefix(deps.binaryPath, deps.npmPrefix)) {
    return { kind: 'linked-refusal', binaryPath: deps.binaryPath };
  }
  const latest = await deps.registryVersion();
  const current = deps.currentVersion;
  const cmp = compareVersions(latest, current);
  if (cmp === 0) return { kind: 'up-to-date', current };
  if (cmp < 0) return { kind: 'local-newer', current, latest };
  if (checkOnly) return { kind: 'available', current, latest };
  await deps.installLatest(current, latest);
  return { kind: 'updated', from: current, to: latest };
}
