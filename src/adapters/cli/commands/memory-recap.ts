import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateRecap, renderRecap } from '../../../app/use-cases/generate-recap.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { parseRouterLog } from '../../../domain/router-log.js';

export function memoryRecapCommand(): Command {
  return new Command('recap')
    .description('Summarize active project memory: rules, threads, blockers, questions, decisions')
    .action(async () => {
      // 2.14 §6.3: relations → счётчик «жалоб без исхода» (нет лога → null, секция опускается)
      const { store, relations } = createCliContainer(process.cwd());
      // P110: router.log плагина wolf-router (нет файла → delivery = null, секция опускается)
      let routerLogText: string | null = null;
      try {
        routerLogText = readFileSync(join(process.cwd(), '.wolf', 'router.log'), 'utf-8');
      } catch {
        routerLogText = null; // ENOENT — плагин ещё не писал
      }
      const report = await generateRecap({
        store,
        relations,
        ...(routerLogText !== null ? { routerLogRows: parseRouterLog(routerLogText).rows } : {}),
      });
      console.log(renderRecap(report));
    });
}
