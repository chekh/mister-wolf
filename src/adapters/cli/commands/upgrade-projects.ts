// src/adapters/cli/commands/upgrade-projects.ts
// T8 (волна 2.19.0, REQ-01/04, ADR-5): hidden-транспорт фазы 2 — вызывается
// ТОЛЬКО re-exec'ом `wolf upgrade` (склейка фаз ADR-2: --no-banner — шапку
// уже напечатала фаза 1). Прод-deps — те же адаптеры, что у T7/T9: реестр
// wolfUserConfigDir, карта релиза, makeStepDeps = hereStepDeps (точечный
// reuse T9, не дубль сборки), UpgradeLock и скан незарегистрированных
// (registeredPaths передаёт оркестратор). Подтверждение — TTY-прецедент
// upgradeHereAction: plans-узел рендерится ДО вопроса (REQ-02).
// --from/--to/--state — контракт re-exec (контекст state-файла), отчёт
// фазы 2 их не требует; banner в report T7 нет, --no-banner — флаг склейки.
import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import { runUpgradeProjects, type UpgradeProjectsDeps } from '../../../app/use-cases/upgrade-projects.js';
import { scanUnregistered } from '../../../app/use-cases/scan-unregistered.js';
import { ProjectsRegistry } from '../../fs/projects-registry.js';
import { loadUpdateMap } from '../../fs/update-map.js';
import { UpgradeLock } from '../../fs/upgrade-lock.js';
import { wolfUserConfigDir } from '../../fs/user-config.js';
import { hereStepDeps, termEnv } from './memory-upgrade.js';
import { renderReport, type ReportNode, type TermEnv } from '../report-renderer.js';

/** IO-шов юнит-контура фазы 2: tty/печать/вопрос; прод — process stdio + readline. */
export interface ProjectsIo {
  tty: boolean;
  env: TermEnv;
  write(text: string): void;
  ask(): Promise<boolean>;
}

function prodIo(): ProjectsIo {
  const env = termEnv(process.stdout, process.env);
  return {
    env,
    tty: Boolean(process.stdout.isTTY),
    write: (text) => process.stdout.write(text),
    ask: async () => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const ans = (await rl.question('Upgrade these projects? [y/N] ')).trim().toLowerCase();
        return ans === 'y' || ans === 'yes';
      } finally {
        rl.close();
      }
    },
  };
}

/** Прод-deps фазы 2 (T8): реестр/карта/фабрика шага/lock/скан — риск-список Ф4. */
export function upgradeProjectsDeps(): UpgradeProjectsDeps {
  return {
    registry: new ProjectsRegistry(wolfUserConfigDir()),
    loadMap: () => loadUpdateMap(),
    makeStepDeps: hereStepDeps,
    upgradeLock: new UpgradeLock(),
    scan: scanUnregistered, // registeredPaths — оркестратор; root — дефолт homedir
  };
}

/** Обвязка фазы 2: deps + TTY-confirm (plans ДО вопроса, REQ-02) + печать
 *  отчёта renderer'ом и простановка exit-кода. */
export async function upgradeProjectsAction(
  yes: boolean,
  deps: UpgradeProjectsDeps = upgradeProjectsDeps(),
  io: ProjectsIo = prodIo()
): Promise<void> {
  const confirm =
    yes || !io.tty
      ? undefined
      : async (plans: ReportNode): Promise<boolean> => {
          io.write(`${renderReport(plans, io.env)}\n`); // список ДО вопроса (REQ-02)
          return io.ask();
        };
  const res = await runUpgradeProjects(deps, { yes, tty: io.tty, confirm });
  io.write(`${renderReport(res.report, io.env)}\n`);
  process.exitCode = res.exitCode;
}

export function upgradeProjectsCommand(): Command {
  return new Command('upgrade-projects')
    .description(
      'Run the registered-projects update pass with the installed CLI version (re-exec target of wolf upgrade; hidden)'
    )
    .option('--from <version>', 'Previous CLI version (context from the phase-1 state file)')
    .option('--to <version>', 'New CLI version (context from the phase-1 state file)')
    .option('--yes', 'Apply the plan without interactive confirmation')
    .option('--no-banner', 'Do not print the banner: phase 1 already opened the section')
    .option('--state <path>', 'Phase-1 state file ({ from, to, startedAt })')
    .action(async (options: { yes?: boolean }) => {
      // from/to/state/noBanner — принятый контракт re-exec; отчёт фазы 2 их не требует
      await upgradeProjectsAction(options.yes === true);
    });
}
