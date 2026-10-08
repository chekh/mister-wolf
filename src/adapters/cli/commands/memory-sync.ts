// src/adapters/cli/commands/memory-sync.ts
import { Command } from 'commander';
import { existsSync } from 'fs';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { OpencodeBaseSetRenderer } from '../../../adapters/render/opencode/opencode-renderer.js';
import { templatesRoot, harnessTemplatesRoot } from '../../../adapters/render/templates-root.js';
import { syncBaseSet } from '../../../app/use-cases/sync-base-set.js';
import { syncArtifactIndex } from '../../../app/use-cases/sync-artifact-index.js';
import { isNpxRun } from '../../../domain/npx.js';
import { UserFacingError } from '../../../domain/errors.js';

export function memorySyncCommand(): Command {
  return new Command('sync')
    .description('Re-render the wolf base set (stamped files only; memory untouched)')
    .action(async () => {
      if (isNpxRun()) {
        throw new UserFacingError(
          'npx try-out: sync does not write the base set. Install the package: npm i -g mister-wolf'
        );
      }
      const baseDir = process.cwd();
      const renderer = new OpencodeBaseSetRenderer(templatesRoot(), {
        harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
      });
      const { outcomes, orphaned } = await syncBaseSet(renderer, baseDir, 'omit');
      const fsAdapter = {
        exists: (p: string) => Promise.resolve(existsSync(p)),
        readFile: async (p: string) => readFile(p, 'utf-8').catch(() => null),
        writeFile: (p: string, c: string) => writeFile(p, c, 'utf-8'),
        listDir: async (p: string) => (existsSync(p) ? (await readdir(p)).filter((f) => !f.startsWith('.')) : []),
        listFiles: async (p: string): Promise<string[]> => {
          const out: string[] = [];
          if (!existsSync(p)) return out;
          const walk = async (dir: string, prefix: string): Promise<void> => {
            for (const e of await readdir(dir, { withFileTypes: true })) {
              if (e.isDirectory()) await walk(join(dir, e.name), `${prefix}${e.name}/`);
              else if (e.name.endsWith('.md')) out.push(`${prefix}${e.name}`);
            }
          };
          await walk(p, '');
          return out;
        },
      };
      const indexResult = await syncArtifactIndex({ fs: fsAdapter, baseDir });
      console.log(
        indexResult.action === 'written'
          ? '- docs/dev/INDEX.md: regenerated'
          : indexResult.action === 'unchanged'
            ? '- docs/dev/INDEX.md: unchanged'
            : '- docs/dev/INDEX.md: docs/dev missing — skipped'
      );
      console.log('# wolf sync');
      console.log('- models: omit — model: lines omitted (no routing source since wave 2.13)');
      for (const o of outcomes) console.log(`- ${o.file}: ${o.action}${o.reason ? ` — ${o.reason}` : ''}`);
      for (const f of orphaned) console.log(`- orphaned (template is gone — you may delete): ${f}`);
      console.log('Memory (.wolf/) untouched: playbook mutations are the Steward zone (D4).');
    });
}
