import { Command } from 'commander';
import { join } from 'path';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { createInterface } from 'node:readline/promises';
import { createCliContainer } from '../../../bootstrap/container.js';
import { ProjectsRegistry } from '../../../adapters/fs/projects-registry.js';
import { wolfUserConfigDir } from '../../../adapters/fs/user-config.js';
import { PLATFORM_ADAPTERS, CANONICAL_MCP_COMMAND } from '../../../adapters/platforms/index.js';
import { writeSchemaVersionIfAbsent } from '../../../adapters/fs/schema-version.js';
import { ensureCurrentSchema } from '../../../adapters/fs/schema-guard.js';
import { initProject, recreateConfig } from '../../../app/use-cases/init-project.js';
import { OpencodeBaseSetRenderer } from '../../../adapters/render/opencode/opencode-renderer.js';
import { templatesRoot, harnessTemplatesRoot, wolfVersion } from '../../../adapters/render/templates-root.js';
import {
  seedBasePlaybooks,
  PlaybookNoteSchema,
  type PlaybookNoteInput,
} from '../../../app/use-cases/seed-base-playbooks.js';
import { governanceDefaults } from '../../../domain/governance.js';
import { isNpxRun } from '../../../domain/npx.js';
import { UserFacingError } from '../../../domain/errors.js';
import { safeCwd } from '../cli-entry.js';
import type { ModelContext } from '../../../ports/base-set-renderer.port.js';

/* ---------- TTY-вопросы (readline, тяжёлых зависимостей не добавляем — §4.6) ---------- */

interface Rl {
  question(q: string): Promise<string>;
}

/** Платформы (§4.4 п.2): opencode всегда дефолт, найденные по маркерам — добавляются к предложению. */
export async function askPlatformChoice(rl: Rl, baseDir: string): Promise<string[]> {
  const detected = PLATFORM_ADAPTERS.filter((a) => a.id !== 'opencode' && a.detect(baseDir)).map((a) => a.id);
  const offer = ['opencode', ...detected];
  const hint = detected.length > 0 ? `; detected by markers: ${detected.join(', ')} — add ids comma-separated` : '';
  const known = new Set(PLATFORM_ADAPTERS.map((a) => a.id));
  for (;;) {
    const ans = (
      await rl.question(`Wolf MCP: platforms [${offer.join(', ')}] (comma-separated, Enter = opencode${hint}): `)
    ).trim();
    if (ans === '') return ['opencode'];
    const ids = ans
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      console.log(`Unknown platform(s): ${unknown.join(', ')} (known: ${[...known].join(', ')})`);
      continue;
    }
    if (ids.length > 0) return ids;
  }
}

/* ---------- вывод v2 (F5/F6/F7) ---------- */

/** Финальный блок «Дальше»: restart — только если MCP реально записан в этом прогоне. */
export function renderNextSteps(opts: { npx: boolean; mcpWritten: boolean; claudeConnected: boolean }): string[] {
  if (opts.npx) {
    return [
      '  → this was an npx try-out; to connect your platform: npm install -g mister-wolf, then re-run: wolf init',
    ];
  }
  const lines = ['Next steps:', '  1. wolf bootstrap — initial project memory image'];
  if (opts.mcpWritten) {
    lines.push('  2. restart opencode — to pick up the MCP server and the default Mr.Wolf agent');
    if (opts.claudeConnected) {
      lines.push('     Claude Code: approve the project-scoped MCP server on first start.');
    }
  }
  return lines;
}

/** F5 (спека 2.1.0 §2.3): скиллы в логе init — `[skill] <имя> → <путь>`; прочие файлы — прежний формат. */
export function formatBaseSetLine(o: { file: string; action: string; reason?: string }): string {
  const skill = o.file.match(/^\.opencode[/\\]skills[/\\]([^/\\]+)[/\\]/);
  if (skill) {
    const suffix = o.action === 'created' ? '' : ` (${o.action}${o.reason ? `: ${o.reason}` : ''})`;
    return `[skill] ${skill[1]} → ${o.file}${suffix}`;
  }
  return `- base set: ${o.file} ${o.action}${o.reason ? ` — ${o.reason}` : ''}`;
}

/** F6 (спека 2.1.0 §2.4): честный лог платформ — имя конфиг-файла + фактические ключи wolf. */
export function formatPlatformLine(o: {
  platform: string;
  action: string;
  reason?: string;
  configFile?: string;
  keys?: string[];
}): string {
  if (o.platform === 'none' || o.platform === 'npx') {
    return `- platform configs: ${o.action} — ${o.reason ?? 'unknown reason'}`;
  }
  if (o.configFile !== undefined) {
    return `- ${o.configFile}: ${o.action}${o.keys?.length ? ` (${o.keys.join(', ')})` : ''}${
      o.reason ? ` — ${o.reason}` : ''
    }`;
  }
  // без configFile (напр. removed) — прежний формат
  return `- platform ${o.platform}: ${o.action}${o.reason ? ` — ${o.reason}` : ''}`;
}

/* ---------- команда ---------- */

export function memoryInitCommand(): Command {
  return new Command('init')
    .description('Initialize Mr. Wolf memory for this project (model pinning is opt-in via --model)')
    .option('--platform <ids>', 'explicit platform list (comma-separated: opencode,claude); replaces the current set')
    .option(
      '--model <id>',
      'model for Mr.Wolf and its agents (<providerID>/<modelID>); opt-in — by default model lines are omitted'
    )
    .option('--recreate', 'backup a corrupted .wolf/config.yaml and re-create it from defaults', false)
    .action(async (options: { platform?: string; model?: string; recreate?: boolean }) => {
      // §2.5 (recreate-guard): init --recreate — единственный вход CLI в обход guard runCli;
      // поэтому cwd берём тоже под защитой (safeCwd: удалённый каталог → однострочный Error, не сырой ENOENT)
      const baseDir = safeCwd();
      if (options.recreate) {
        await recreateConfig(baseDir);
        // восстановление = приведение к валидному СОСТОЯНИЮ, а не тихий штамп маркера ниже:
        // легаси-схема (1/без маркера) мигрирует здесь (layout + маркер), иначе markSchemaCurrent
        // дописал бы v2 без layout-миграции и objects/ остался бы осиротевшим навсегда;
        // схема из будущего — честный отказ «обнови wolf» (спека §3), а не даунгрейд 99→2
        await ensureCurrentSchema(baseDir);
      }

      let platformChoice: string[] | undefined;
      let platformSource: 'flag' | 'tty' | 'default' | undefined;
      if (options.platform !== undefined) {
        platformChoice = options.platform
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '');
        const known = new Set(PLATFORM_ADAPTERS.map((a) => a.id));
        const unknown = platformChoice.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          throw new UserFacingError(`Unknown platform(s): ${unknown.join(', ')} (known: ${[...known].join(', ')})`);
        }
        platformSource = 'flag';
      }

      // WP2 unpin (спека 2.16 §5): модель не спрашиваем; пиннинг — opt-in через --model
      const isTty = Boolean(process.stdout.isTTY);
      const models: ModelContext | 'omit' =
        options.model !== undefined ? { primary: options.model, worker: options.model } : 'omit';
      const modelSource = options.model !== undefined ? ('flag' as const) : undefined;
      // npx try-out: пайплайн молчит (§4 п.6) — вопросы не задаём, ответы всё равно выброшены
      if (isTty && platformChoice === undefined && !isNpxRun()) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          platformChoice = await askPlatformChoice(rl, baseDir);
          platformSource = 'tty';
        } finally {
          rl.close();
        }
      }

      const { initializer, store, log, clock, idGen, index, lock, declarations } = createCliContainer(baseDir);
      const registry = new ProjectsRegistry(wolfUserConfigDir());

      const tplPlaybooks = join(templatesRoot(), 'playbooks');
      const playbookFiles = new Map<string, string>();
      if (existsSync(tplPlaybooks)) {
        for (const f of readdirSync(tplPlaybooks)) {
          if (f.endsWith('.md')) playbookFiles.set(f, readFileSync(join(tplPlaybooks, f), 'utf-8'));
        }
      }
      // ListFilters поддерживает type (memory-store.port.ts) — фильтр на уровне порта (правка r2)
      // wave13-a: playbook → note+facet howto; старые файлы читаются как note (alias)
      const existing = (await store.list({ type: 'note' })).filter(
        (o) =>
          (o as { facet?: string }).facet === 'howto' || (o as { alias_origin?: string }).alias_origin === 'playbook'
      );
      const seededOwners = new Set(
        existing.map((o) => (o as { owner_skill?: string }).owner_skill).filter((x): x is string => Boolean(x))
      );
      // wave13-a: guard полей addMemoryObject не пускает steps/owner_skill в extra
      // note — сеем напрямую по window-compat паттерну (схема — PlaybookNoteSchema)
      const addFn = (input: PlaybookNoteInput) => {
        const now = clock.now();
        const defaults = governanceDefaults(input.createdBy);
        const object = {
          id: idGen.generateMemoryId(now, input.title),
          type: 'note' as const,
          facet: 'howto' as const,
          title: input.title,
          body: input.body,
          status: 'active' as const,
          review_state: 'accepted' as const,
          confidence: 'medium' as const,
          importance: 0.5,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          created_by: input.createdBy,
          schema_version: 1,
          source: { kind: 'manual' as const },
          related: { files: [], docs: [], decisions: [] },
          tags: input.tags,
          superseded_by: null,
          memory_class: defaults.memory_class,
          truth_role: defaults.truth_role,
          lifetime: defaults.lifetime,
          ...input.extra,
        };
        PlaybookNoteSchema.parse(object);
        return (async () => {
          await store.save(object);
          await log.append({
            id: idGen.generateEventId(now),
            type: 'memory.added',
            timestamp: now.toISOString(),
            actor: input.createdBy,
            payload: { memory_id: object.id, type: object.type },
          });
          if (index) await index.indexObject(object);
        })();
      };

      const result = await initProject(
        {
          initializer,
          registry,
          adapters: PLATFORM_ADAPTERS,
          mcpCommand: CANONICAL_MCP_COMMAND,
          npx: isNpxRun(),
          markSchemaCurrent: (dir) => writeSchemaVersionIfAbsent(dir),
          store,
          log,
          clock,
          idGen,
          index,
          lock,
          declarations,
          wolfVersion: wolfVersion(),
          baseSet: {
            render: (dir, opts) =>
              new OpencodeBaseSetRenderer(templatesRoot(), {
                harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
              }).renderBaseSet(dir, opts),
            seed: () =>
              seedBasePlaybooks({
                files: playbookFiles,
                add: async (i) => {
                  await addFn(i);
                  return {};
                },
                isSeeded: async (owner) => seededOwners.has(owner),
              }),
          },
        },
        baseDir,
        { platformChoice, platformSource, models, modelSource }
      );

      console.log('# wolf init');
      console.log(`- memory skeleton: ensured (${join(baseDir, '.wolf')})`);
      for (const o of result.baseSetOutcomes) console.log(formatBaseSetLine(o)); // F5: скиллы — [skill] имя → путь
      for (const outcome of result.platformOutcomes) console.log(formatPlatformLine(outcome)); // F6: configFile + keys
      console.log(
        result.initReport.action === 'created'
          ? `- init-report: created (${result.initReport.id})`
          : '- init-report: already exists — not duplicating'
      );
      for (const line of renderNextSteps({
        npx: result.npx,
        mcpWritten: result.platformOutcomes.some((o) => o.action === 'written' || o.action === 'replaced'),
        claudeConnected: result.platformOutcomes.some((o) => o.platform === 'claude' && o.action !== 'removed'),
      })) {
        console.log(line);
      }
      console.log(`Project registered: ${join(wolfUserConfigDir(), 'projects.yaml')}`);

      // §3: ненулевой exit — только если при явном --platform не записано ни одного конфига
      const wroteSomething = result.platformOutcomes.some((o) =>
        ['written', 'replaced', 'unchanged'].includes(o.action)
      );
      if (platformChoice !== undefined && !wroteSomething) process.exitCode = 1;
    });
}
