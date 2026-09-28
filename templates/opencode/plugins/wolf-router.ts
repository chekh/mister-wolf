/**
 * Mr.Wolf router plugin (шаблон базового набора, спека §5.4).
 *
 * Слой доставки №1 playbook-контекста (канон §7.1): детерминированная
 * доставка вместо вероятностного wolf search агентом. Маркер
 * `agent-id: <id>` В ТЕЛЕ рамки агента (frontmatter в system-промпт не
 * попадает — известная грабля) → wolf search --type playbook → get +
 * гвард owner_skill === agentId | `skill:${agentId}` (legacy) → максимальная
 * version → инжект в system-промпт на каждое сообщение.
 *
 * Fallback (T012, волна 1.1): канон приоритетен; при miss для ЛЮБОГО
 * agent-id инъецируется встроенный универсальный FALLBACK_PLAYBOOK —
 * доставка не зависит от того, звала ли рамка wolf search (слой №2).
 * В router.log: variant=canonical | variant=fallback. Реестр доставок =
 * сами playbook-объекты через owner_skill, отдельного конфига нет.
 *
 * Ноль зависимостей (Node stdlib; ai-sdk НЕ используется). Fail-safe: всё в
 * try/catch — плагин не имеет права уронить сессию (лог: .wolf/router.log —
 * agent-id, name, variant, injected). Через этот файл при рендере проходят
 * подстановка {{tool.*}} и штамп `// wolf:rendered` (ставит рендерер).
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
const CACHE_TTL_MS = 2500;

const run = promisify(execFile);
// execFile: args array, no shell. Целевой проект — глобальный `wolf`;
// догфуд в репо Wolf — локальный dist. Ошибка обоих → исключение наверх (fail-safe).
// Волна 0 (0.2): свежий WOLF_SESSION на каждый spawn — унаследованный из long-lived
// opencode-процесса env дал бы одну фальшивую сессию на все доставки.
const runWolf = (args: string[]): Promise<{ stdout: string }> => {
  const opts = {
    cwd: PROJECT_ROOT,
    timeout: 5000,
    env: { ...process.env, WOLF_SESSION: 'opc-' + randomUUID() },
  };
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

// ponytail: per-agent кэш 2.5с — свежесть между сообщениями, без CLI-спавна на каждый чих.
const cache = new Map<string, { value: { id: string; body: string } | null; at: number }>();

async function resolvePlaybook(agentId: string): Promise<{ id: string; body: string } | null> {
  const hit = cache.get(agentId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  let found: { id: string; body: string } | null = null;
  try {
    const { stdout } = await runWolf(['search', agentId, '--type', 'playbook', '--hide-superseded']);
    const ids = [...stdout.matchAll(/^([\w-]+) \[playbook\]/gm)].map((m) => m[1]);
    let best: { id?: string; body?: string } | null = null;
    let bestVersion = -1;
    for (const id of ids) {
      const { stdout: json } = await runWolf(['get', id]);
      const obj = JSON.parse(json);
      const owner = obj.owner_skill ?? obj.extra?.owner_skill;
      if (owner !== agentId && owner !== `skill:${agentId}`) continue; // гвард владельца
      const version = Number(String(obj.version ?? '').match(/\d+/)?.[0] ?? 0);
      if (version > bestVersion) {
        bestVersion = version;
        best = obj;
      }
    }
    found = best?.body ? { id: String(best.id ?? ''), body: best.body } : null;
  } catch {
    /* fail-safe: без playbook — рамка работает через wolf search */
  }
  cache.set(agentId, { value: found, at: Date.now() });
  return found;
}

export const WolfPlaybookPlugin = async () => ({
  'experimental.chat.system.transform': async (_input, output) => {
    try {
      const joined = output.system.join('\n');
      const m = joined.match(AGENT_ID_RE);
      if (!m) return; // рамка без маркера — не наша забота
      if (joined.includes(INJECT_HEADER)) return; // идемпотентность: не вставляем дважды
      const agentId = m[1];
      const resolved = await resolvePlaybook(agentId);
      if (resolved) {
        output.system.push(`\n\n${INJECT_HEADER}\n\n${resolved.body}`);
        logRoute(`agent-id=${agentId} playbook=hit name=${resolved.id} variant=canonical injected=yes`);
      } else {
        // T012: miss канона → универсальный fallback; инъекция для любого agent-id
        output.system.push(`\n\n${INJECT_HEADER}\n\n${FALLBACK_PLAYBOOK}`);
        logRoute(`agent-id=${agentId} playbook=hit name=fallback variant=fallback injected=yes`);
      }
    } catch {
      /* fail-safe: не роняем сессию */
    }
  },
});
