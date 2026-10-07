/**
 * Mr.Wolf router plugin (шаблон базового набора, спека §5.4).
 *
 * Слой доставки №1 playbook-контекста (канон §7.1): детерминированная
 * доставка вместо вероятностного wolf search агентом. Маркер
 * `agent-id: <id>` В ТЕЛЕ рамки агента (frontmatter в system-промпт не
 * попадает — известная грабля) → wolf search `<agentId> playbook` (после
 * таксономии 2.13 канон — note+facet howto, type-фильтр не применим) → get +
 * гвард owner_skill === agentId | `skill:${agentId}` (legacy) → первый
 * прошедший гвард кандидат (ранний стоп, A2-б) → инжект в system-промпт
 * на каждое сообщение.
 *
 * Fallback (T012, волна 1.1): канон приоритетен; при miss для ЛЮБОГО
 * agent-id инъецируется встроенный универсальный FALLBACK_PLAYBOOK —
 * доставка не зависит от того, звала ли рамка wolf search (слой №2).
 * В router.log: variant=canonical | variant=fallback. Реестр доставок =
 * сами playbook-объекты через owner_skill, отдельного конфига нет.
 *
 * Ноль зависимостей (Node stdlib; ai-sdk НЕ используется). Fail-safe: всё в
 * try/catch — плагин не имеет права уронить сессию (лог: .wolf/router.log —
 * agent-id, name, variant, injected, ms, bytes). Через этот файл при рендере
 * проходят подстановка {{tool.*}} и штамп `// wolf:rendered` (ставит рендерер).
 */

import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const LOCAL_CLI = path.join(PROJECT_ROOT, 'dist', 'bootstrap', 'cli.js');
// WOLF_ROUTER_LOG — тест-шов (юнит-тесты пишут в tmp, не в живой dogfood-лог)
const LOG = process.env.WOLF_ROUTER_LOG ?? path.join(PROJECT_ROOT, '.wolf', 'router.log');
const INJECT_HEADER = '# Актуальный playbook (источник: память Wolf, доставлен плагином; обязательный формат ответа)';
// T012 (волна 1.1): встроенный универсальный playbook для agent-id без канона
// в памяти. Role-агностичный базовый контур Wolf; канон всегда приоритетен.
const FALLBACK_PLAYBOOK = `# Универсальный playbook (fallback)

Канонического playbook для твоего agent-id в памяти Wolf нет — работай
по этому универсальному контуру.

1. Холодный старт сессии: \`wolf call\` → \`wolf brief\` — возвращённые
   injections и brief — активное руководство проекта.
2. Значимое фиксируй в память Wolf: решения — \`add --type decision\`,
   уроки — \`--type lesson\`, блокеры — \`--type blocker\`.
3. Состояние проекта спрашивай у Wolf (\`wolf search\`, \`wolf get\`,
   \`wolf brief\`): статические списки в файлах устаревают.
4. Правила и playbook'ы не мутируй сам — мутатор Стюард; систематически
   плохое ПРАВИЛО → \`wolf complain\` (не тул и не разовый случай).
5. Сбой тула — FRICTION-строка в отчёте (\`FRICTION: <n>× <тул> —
   причина; обошёл через <что сработало>\`), не молча и не ретраи в стол.`;
// [ \t] вместо \s: \s съедает переводы строк и вытаскивает id с чужой строки.
const AGENT_ID_RE = /^agent-id:[ \t]*([\w-]+)[ \t]*$/m;
// Спека A2: playbook — canonical-память, Стюард мутирует редко → TTL 5 минут.
// Негативный кэш (null) живёт тем же TTL — повторный miss не спавнит CLI.
const CACHE_TTL_MS = 300_000;

// agent-id последней рамки, пропущенной через system.transform (для skill-метрики B3)
let lastAgentId: string | null = null;

const run = promisify(execFile);
// execFile: args array, no shell. Целевой проект — глобальный `wolf`;
// догфуд в репо Wolf — локальный dist. Ошибка обоих → исключение наверх (fail-safe).
// WOLF_SESSION (4.C): ключ ставится фабрикой ОДИН раз на процесс opencode —
// спавны и bash-вызовы волка наследуют его из process.env (execFile без
// env-поля наследует сам). Известный потолок: несколько чатов одного процесса
// opencode шарят ключ — консервативная недо-дедупликация, не ошибка.
const runWolf = (args: string[]): Promise<{ stdout: string }> => {
  const opts = { cwd: PROJECT_ROOT, timeout: 5000 };
  return run('wolf', args, opts).catch(() => run('node', [LOCAL_CLI, ...args], opts));
};

function logRoute(line: string): void {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* fail-safe */
  }
}

// ponytail: per-agent кэш на TTL 5 мин — canonical-память мутируется редко,
// CLI-спавн не на каждое сообщение.
const cache = new Map<string, { value: { id: string; body: string } | null; at: number }>();

async function resolvePlaybook(agentId: string): Promise<{ id: string; body: string } | null> {
  const hit = cache.get(agentId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  let found: { id: string; body: string } | null = null;
  try {
    // 2.13: плейбуки живут как note+facet howto (type 'playbook' — legacy),
    // поэтому без --type; слово «playbook» (title/tags канона) сужает выборку.
    // Формат строки search: `<id> [<type>] [<facet>] <title>`; тип в строке не
    // фильтруем — каноничность решает гвард owner_skill ниже.
    const { stdout } = await runWolf(['search', agentId, 'playbook', '--hide-superseded']);
    const ids = [...stdout.matchAll(/^([\w-]+) \[\w+\]/gm)].map((m) => m[1]);
    // Ранний стоп (спека A2-б): релевантность поиска уже отсортировала,
    // --hide-superseded отсекает старые версии — первый кандидат, прошедший
    // гвард владельца, и есть результат (один get при miss вместо K подряд).
    for (const id of ids) {
      const { stdout: json } = await runWolf(['get', id]);
      const obj = JSON.parse(json);
      const owner = obj.owner_skill ?? obj.extra?.owner_skill;
      if (owner !== agentId && owner !== `skill:${agentId}`) continue; // гвард владельца
      if (obj.body) found = { id: String(obj.id ?? id), body: obj.body };
      break;
    }
  } catch {
    /* fail-safe: без playbook — рамка работает через wolf search */
  }
  cache.set(agentId, { value: found, at: Date.now() });
  return found;
}

// B3: метрика вызовов скиллов. Форма входа v1: input.tool — имя тула,
// output.args — объект аргументов; v2: event.tool + event.input (name | skill —
// фолбэк). Отдельный JSONL-файл — инвариант: enum событий SignalEventSchema
// закрытый, в общий router.log эти события класть нельзя. WOLF_SKILL_LOG —
// тест-шов (читается на каждый вызов: env ставится тестами уже после импорта).
function recordSkillMetric(tool: unknown, args: unknown): void {
  try {
    if (tool !== 'skill') return;
    const a = (args ?? {}) as { name?: string; skill?: string } | null;
    const skill = a?.name ?? a?.skill;
    if (!skill) return;
    const file =
      process.env.WOLF_SKILL_LOG ?? path.join(PROJECT_ROOT, '.wolf', 'metrics', 'skill-invocations.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const entry: { ts: string; skill: string; agent?: string } = { ts: new Date().toISOString(), skill };
    if (lastAgentId) entry.agent = lastAgentId;
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
  } catch {
    /* fail-safe: падение метрики не роняет сессию */
  }
}

// Общая доставка playbook (v1 system.transform / v2 context): joined system-текст
// → маркер agent-id → гвард идемпотентности INJECT_HEADER → resolvePlaybook →
// push(текст). Fail-safe: не роняем сессию ни на одном шаге.
async function deliverPlaybook(joined: string, push: (text: string) => void): Promise<void> {
  try {
    const m = joined.match(AGENT_ID_RE);
    if (!m) return; // рамка без маркера — не наша забота
    if (joined.includes(INJECT_HEADER)) return; // идемпотентность: не вставляем дважды
    const agentId = m[1];
    lastAgentId = agentId; // агент известен хуку skill-метрики (B3)
    const startedAt = Date.now();
    const resolved = await resolvePlaybook(agentId);
    const ms = Date.now() - startedAt;
    if (resolved) {
      push(`\n\n${INJECT_HEADER}\n\n${resolved.body}`);
      logRoute(
        `agent-id=${agentId} playbook=hit name=${resolved.id} variant=canonical injected=yes` +
          ` ms=${ms} bytes=${Buffer.byteLength(resolved.body)}`
      );
    } else {
      // T012: miss канона → универсальный fallback; инъекция для любого agent-id
      push(`\n\n${INJECT_HEADER}\n\n${FALLBACK_PLAYBOOK}`);
      logRoute(
        `agent-id=${agentId} playbook=hit name=fallback variant=fallback injected=yes` +
          ` ms=${ms} bytes=${Buffer.byteLength(FALLBACK_PLAYBOOK)}`
      );
    }
  } catch {
    /* fail-safe: не роняем сессию */
  }
}

// 4.C: один WOLF_SESSION на процесс opencode — спавны волка и bash-вызовы
// наследуют ключ. Известный потолок: несколько чатов одного процесса opencode
// шарят ключ — консервативная недо-дедупликация, не ошибка.
function ensureSession(): void {
  if (!process.env.WOLF_SESSION) process.env.WOLF_SESSION = 'opc-' + randomUUID();
}

// v1-фабрика: loader v1 вызывает `server()` и получает hook-объект.
async function server() {
  ensureSession();
  return {
    'experimental.chat.system.transform': async (_input: unknown, output: { system: string[] }) => {
      await deliverPlaybook((output?.system ?? []).join('\n'), (text) => output.system.push(text));
    },
    'tool.execute.before': async (input: unknown, output: unknown) => {
      recordSkillMetric(
        (input as { tool?: string } | null)?.tool,
        (output as { args?: { name?: string; skill?: string } } | null)?.args
      );
    },
  };
}

// v2-контракт: loader v2 вызывает `setup(ctx)`; инъекция — текст-блок в
// event.system (мутация доходит до модельного запроса), метрика — tool-hook.
interface V2ContextEvent {
  system: Array<{ type: 'text'; text: string }>;
  messages: Array<{ id: string; role: string; content: Array<{ type: 'text'; text: string }>; metadata: unknown }>;
  agent: string;
}
interface V2ToolEvent {
  tool: string;
  input: unknown;
  id: string;
}
interface V2Ctx {
  session: {
    hook(name: 'context', fn: (event: V2ContextEvent) => Promise<void>): Promise<{ dispose: () => Promise<void> }>;
  };
  tool: {
    hook(
      name: 'execute.before',
      fn: (event: V2ToolEvent) => Promise<void>
    ): Promise<{ dispose: () => Promise<void> }>;
  };
}

async function setup(ctx: V2Ctx) {
  ensureSession();
  await ctx.session.hook('context', async (event) => {
    await deliverPlaybook(
      (event?.system ?? []).map((s) => s.text).join('\n'),
      (text) => event.system.push({ type: 'text', text })
    );
  });
  await ctx.tool.hook('execute.before', async (event) => {
    recordSkillMetric(event.tool, event.input);
  });
}

// РОВНО ОДИН export на файл (контракт loader'а opencode): dual v1/v2 entry.
export default { id: 'wolf-router', setup, server };
