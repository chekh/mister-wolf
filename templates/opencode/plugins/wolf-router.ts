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
 * Fallback — слой доставки №2: если плагин ничего не нашёл, рамка сама зовёт
 * `wolf search` (см. рамки агентов базового набора). Реестр доставок = сами
 * playbook-объекты через owner_skill, отдельного конфига нет.
 *
 * Ноль зависимостей (Node stdlib; ai-sdk НЕ используется). Fail-safe: всё в
 * try/catch — плагин не имеет права уронить сессию (лог: .wolf/router.log —
 * agent-id, hit/miss, injected). Через этот файл при рендере проходят
 * подстановка {{tool.*}} и штамп `// wolf:rendered` (ставит рендерер).
 */

import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const LOCAL_CLI = path.join(PROJECT_ROOT, 'dist', 'bootstrap', 'cli.js');
const LOG = path.join(PROJECT_ROOT, '.wolf', 'router.log');
const INJECT_HEADER =
  '# Актуальный playbook (источник: память Wolf, доставлен плагином; обязательный формат ответа)';
// [ \t] вместо \s: \s съедает переводы строк и вытаскивает id с чужой строки.
const AGENT_ID_RE = /^agent-id:[ \t]*([\w-]+)[ \t]*$/m;
const CACHE_TTL_MS = 2500;

const run = promisify(execFile);
// execFile: args array, no shell. Целевой проект — глобальный `wolf`;
// догфуд в репо Wolf — локальный dist. Ошибка обоих → исключение наверх (fail-safe).
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

// ponytail: per-agent кэш 2.5с — свежесть между сообщениями, без CLI-спавна на каждый чих.
const cache = new Map<string, { value: string | null; at: number }>();

async function resolvePlaybook(agentId: string): Promise<string | null> {
  const hit = cache.get(agentId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  let body: string | null = null;
  try {
    const { stdout } = await runWolf(['search', agentId, '--type', 'playbook', '--hide-superseded']);
    const ids = [...stdout.matchAll(/^([\w-]+) \[playbook\]/gm)].map((m) => m[1]);
    let best: { body?: string } | null = null;
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
    body = best?.body ?? null;
  } catch {
    /* fail-safe: без playbook — рамка работает через wolf search */
  }
  cache.set(agentId, { value: body, at: Date.now() });
  return body;
}

export const WolfPlaybookPlugin = async () => ({
  'experimental.chat.system.transform': async (_input, output) => {
    try {
      const joined = output.system.join('\n');
      const m = joined.match(AGENT_ID_RE);
      if (!m) return; // рамка без маркера — не наша забота
      if (joined.includes(INJECT_HEADER)) return; // идемпотентность: не вставляем дважды
      const agentId = m[1];
      const body = await resolvePlaybook(agentId);
      if (!body) {
        logRoute(`agent-id=${agentId} playbook=miss injected=no`);
        return; // fail-safe: fallback на wolf search самой рамкой
      }
      output.system.push(`\n\n${INJECT_HEADER}\n\n${body}`);
      logRoute(`agent-id=${agentId} playbook=hit injected=yes`);
    } catch {
      /* fail-safe: не роняем сессию */
    }
  },
});
