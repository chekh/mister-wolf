// src/adapters/cli/commands/memory-sync.ts
import { Command } from 'commander';
import { OpencodeBaseSetRenderer } from '../../../adapters/render/opencode/opencode-renderer.js';
import { templatesRoot, harnessTemplatesRoot } from '../../../adapters/render/templates-root.js';
import { syncBaseSet } from '../../../app/use-cases/sync-base-set.js';
import { findModelRouting, parseModelRouting } from '../../../app/use-cases/model-routing.js';
import { MarkdownMemoryStore } from '../../../adapters/fs/markdown-memory-store.js';
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
      // §4.5: sync подставляет модели из routing-объекта; легаси без него — omit
      const routingObj = await findModelRouting(new MarkdownMemoryStore(baseDir));
      const routing = routingObj ? parseModelRouting(routingObj) : null;
      const { outcomes, orphaned } = await syncBaseSet(renderer, baseDir, routing ?? 'omit');
      console.log('# wolf sync');
      console.log(
        routing
          ? `- models: primary=${routing.primary} worker=${routing.worker} (routing-объект ${routingObj?.id})`
          : '- models: omit — routing-объект не найден (легаси), model:-строки опущены (§4.5)'
      );
      for (const o of outcomes) console.log(`- ${o.file}: ${o.action}${o.reason ? ` — ${o.reason}` : ''}`);
      for (const f of orphaned) console.log(`- orphaned (шаблон исчез — можешь удалить): ${f}`);
      console.log("Память (.wolf/) не тронута: мутации playbook'ов — зона Стюарда (D4).");
    });
}
