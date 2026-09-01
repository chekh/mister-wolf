import { Command } from 'commander';
import { join } from 'path';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { createInterface } from 'node:readline/promises';
import { createCliContainer } from '../../../bootstrap/container.js';
import { ProjectsRegistry } from '../../../adapters/fs/projects-registry.js';
import { wolfUserConfigDir } from '../../../adapters/fs/user-config.js';
import { PLATFORM_ADAPTERS, CANONICAL_MCP_COMMAND } from '../../../adapters/platforms/index.js';
import { parseJsonc } from '../../../adapters/platforms/jsonc.js';
import { writeSchemaVersionIfAbsent } from '../../../adapters/fs/schema-version.js';
import { ensureCurrentSchema } from '../../../adapters/fs/schema-guard.js';
import { initProject, recreateConfig } from '../../../app/use-cases/init-project.js';
import { OpencodeBaseSetRenderer } from '../../../adapters/render/opencode/opencode-renderer.js';
import { templatesRoot, harnessTemplatesRoot, wolfVersion } from '../../../adapters/render/templates-root.js';
import { seedBasePlaybooks } from '../../../app/use-cases/seed-base-playbooks.js';
import { addMemoryObject } from '../../../app/use-cases/add-memory-object.js';
import { isNpxRun } from '../../../domain/npx.js';
import { UserFacingError } from '../../../domain/errors.js';
import type { ModelContext } from '../../../ports/base-set-renderer.port.js';

/* ---------- предложения модели «по возможности» (§4.5, только чтение) ---------- */

/** ENV-ключ известных провайдеров → предлагаемая модель. */
export const PROVIDER_ENV_MODELS: readonly (readonly [string, string])[] = [
  ['ZAI_API_KEY', 'zai-coding-plan/glm-5.3'],
  ['ANTHROPIC_API_KEY', 'anthropic/claude-sonnet-4-5'],
  ['OPENAI_API_KEY', 'openai/gpt-5'],
  ['GEMINI_API_KEY', 'google/gemini-2.5-pro'],
];

/** Список предложений: глобальный конфиг opencode первым, затем найденные ENV-ключи. */
export function modelSuggestions(env: NodeJS.ProcessEnv, globalModel: string | null): string[] {
  const out: string[] = [];
  if (globalModel) out.push(globalModel);
  for (const [key, model] of PROVIDER_ENV_MODELS) {
    if (env[key]) out.push(model);
  }
  return [...new Set(out)];
}

function readFileSyncOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

/** Модель из глобального конфига opencode (~/.config/opencode/opencode.json[c]); только чтение. */
export function readGlobalOpencodeModel(read = readFileSyncOrNull): string | null {
  const home = process.env.HOME;
  if (!home) return null;
  for (const name of ['opencode.json', 'opencode.jsonc'] as const) {
    const raw = read(join(home, '.config', 'opencode', name));
    if (raw === null) continue;
    try {
      const cfg = parseJsonc(raw) as { model?: unknown };
      if (typeof cfg.model === 'string' && cfg.model.includes('/')) return cfg.model;
    } catch {
      // нечитаемый конфиг — пропускаем (детект «по возможности», §4.5)
    }
  }
  return null;
}

/* ---------- TTY-вопросы (readline, тяжёлых зависимостей не добавляем — §4.6) ---------- */

interface Rl {
  question(q: string): Promise<string>;
}

/** Платформы (§4.4 п.2): opencode всегда дефолт, найденные по маркерам — добавляются к предложению. */
export async function askPlatformChoice(rl: Rl, baseDir: string): Promise<string[]> {
  const detected = PLATFORM_ADAPTERS.filter((a) => a.id !== 'opencode' && a.detect(baseDir)).map((a) => a.id);
  const offer = ['opencode', ...detected];
  const hint = detected.length > 0 ? `; найдены по маркерам: ${detected.join(', ')} — добавьте id через запятую` : '';
  const known = new Set(PLATFORM_ADAPTERS.map((a) => a.id));
  for (;;) {
    const ans = (
      await rl.question(`Wolf MCP: платформы [${offer.join(', ')}] (через запятую, Enter = opencode${hint}): `)
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

/** Модель (§4.5): один вопрос, Enter — первое предложение, свободный ввод, пропустить нельзя (Q11). */
export async function askModel(rl: Rl, suggestions: string[]): Promise<string> {
  if (suggestions.length > 0) {
    const list = suggestions.map((m, i) => `  ${i + 1}. ${m}`).join('\n');
    for (;;) {
      const ans = (
        await rl.question(
          `Модель Mr.Wolf и его агентов <providerID>/<modelID>:\n${list}\nНомер или свой id, Enter = 1: `
        )
      ).trim();
      if (ans === '') return suggestions[0];
      const n = Number(ans);
      if (/^\d+$/.test(ans) && n >= 1 && n <= suggestions.length) return suggestions[n - 1];
      return ans;
    }
  }
  for (;;) {
    const ans = (await rl.question('Модель Mr.Wolf и его агентов <providerID>/<modelID>: ')).trim();
    if (ans !== '') return ans;
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
  const lines = ['Дальше:', '  1. wolf bootstrap — первичный образ памяти проекта'];
  if (opts.mcpWritten) {
    lines.push('  2. перезапустите opencode — подхватить MCP-сервер и дефолтного агента Mr.Wolf');
    if (opts.claudeConnected) {
      lines.push('     Claude Code: approve the project-scoped MCP server on first start.');
    }
  }
  return lines;
}

/* ---------- команда ---------- */

export function memoryInitCommand(): Command {
  return new Command('init')
    .description('Initialize Mr. Wolf memory for this project (interactive in TTY; non-interactive requires --model)')
    .option('--platform <ids>', 'explicit platform list (comma-separated: opencode,claude); replaces the current set')
    .option('--model <id>', 'model for Mr.Wolf and its agents (<providerID>/<modelID>); required when non-interactive')
    .option('--recreate', 'backup a corrupted .wolf/config.yaml and re-create it from defaults', false)
    .action(async (options: { platform?: string; model?: string; recreate?: boolean }) => {
      const baseDir = process.cwd();
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

      // Двухрежимность (D12/Q11): TTY — вопросы; не-TTY — --model обязателен, жёсткая ошибка
      const isTty = Boolean(process.stdout.isTTY);
      let model = options.model;
      let modelSource: 'flag' | 'tty' | undefined = options.model !== undefined ? 'flag' : undefined;
      if (!isTty && options.model === undefined) {
        throw new UserFacingError(
          'non-interactive init requires a model; re-run: wolf init --model <providerID/modelID> [--platform <ids>]'
        );
      }
      // npx try-out: пайплайн молчит (§4 п.6) — вопросы не задаём, ответы всё равно выброшены
      if (isTty && options.model === undefined && !isNpxRun()) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          if (platformChoice === undefined) {
            platformChoice = await askPlatformChoice(rl, baseDir);
            platformSource = 'tty';
          }
          model = await askModel(rl, modelSuggestions(process.env, readGlobalOpencodeModel()));
          modelSource = 'tty';
        } finally {
          rl.close();
        }
      }
      const models: ModelContext = { primary: model ?? '', worker: model ?? '' }; // worker = primary (Q7); npx — не используется

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
      const existing = await store.list({ type: 'playbook' });
      const seededOwners = new Set(
        existing.map((o) => (o as { owner_skill?: string }).owner_skill).filter((x): x is string => Boolean(x))
      );
      const addFn = (input: Parameters<typeof addMemoryObject>[1]) =>
        addMemoryObject({ store, log, clock, idGen, index, lock, declarations }, input);

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
      for (const o of result.baseSetOutcomes)
        console.log(`- base set: ${o.file} ${o.action}${o.reason ? ` — ${o.reason}` : ''}`);
      for (const outcome of result.platformOutcomes) {
        const label =
          outcome.platform === 'none' || outcome.platform === 'npx'
            ? 'platform configs'
            : `platform ${outcome.platform}`;
        console.log(`- ${label}: ${outcome.action}${outcome.reason ? ` — ${outcome.reason}` : ''}`);
      }
      if (result.routing.action !== 'skipped') {
        console.log(`- routing: модели агентов — ${result.routing.action} (primary ${models.primary})`);
      }
      console.log(
        result.initReport.action === 'created'
          ? `- init-report: created (${result.initReport.id})`
          : '- init-report: already exists — не дублирую'
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
