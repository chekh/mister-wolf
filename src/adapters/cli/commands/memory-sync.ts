// src/adapters/cli/commands/memory-sync.ts
import { Command } from 'commander';
import { OpencodeBaseSetRenderer } from '../../../adapters/render/opencode/opencode-renderer.js';
import { templatesRoot, harnessTemplatesRoot } from '../../../adapters/render/templates-root.js';
import { syncBaseSet } from '../../../app/use-cases/sync-base-set.js';
import { isNpxRun } from '../../../domain/npx.js';
import { UserFacingError } from '../../../domain/errors.js';

export function memorySyncCommand(): Command {
  return new Command('sync')
    .description('Re-render the wolf base set (stamped files only; memory untouched)')
    .action(async () => {
      if (isNpxRun()) {
        throw new UserFacingError('npx try-out: sync не пишет набор. Установи пакет: npm i -g mister-wolf');
      }
      const baseDir = process.cwd();
      const renderer = new OpencodeBaseSetRenderer(templatesRoot(), {
        harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
      });
      const { outcomes, orphaned } = await syncBaseSet(renderer, baseDir);
      console.log('# wolf sync');
      for (const o of outcomes) console.log(`- ${o.file}: ${o.action}${o.reason ? ` — ${o.reason}` : ''}`);
      for (const f of orphaned) console.log(`- orphaned (шаблон исчез — можешь удалить): ${f}`);
      console.log("Память (.wolf/) не тронута: мутации playbook'ов — зона Стюарда (D4).");
    });
}
