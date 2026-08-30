/**
 * Слой доставки №1 playbook-контекста (спека самообучения §13 «Память как
 * источник истины: слои, playbook, рамочная доставка»,
 * docs/superpowers/specs/2026-08-26-self-learning-design.md).
 *
 * Детерминированная доставка вместо вероятностного wolf search агентом:
 * маркер `agent-id: <id>` В ТЕЛЕ рамки агента (frontmatter в system-промпт
 * не попадает — известная грабля) → wolf search --type playbook → get +
 * гвард owner_skill === agentId | `skill:${agentId}` (legacy) → максимальная
 * version → инжект в system-промпт на каждое сообщение.
 *
 * Fallback — слой доставки №2: если плагин ничего не нашёл, рамка сама зовёт
 * `wolf search`. Реестр доставок = сами playbook-объекты через owner_skill,
 * отдельного конфига нет. Всё в try/catch: плагин не имеет права уронить
 * сессию (лог: .wolf/router.log — agent-id, hit/miss, injected).
 */

import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(PROJECT_ROOT, 'dist', 'bootstrap', 'cli.js');
const LOG = path.join(PROJECT_ROOT, '.wolf', 'router.log');
const INJECT_HEADER = '# Актуальный playbook (источник: память Wolf, доставлен плагином; обязательный формат ответа)';
// [ \t] вместо \s: \s съедает переводы строк и вытаскивает id с чужой строки.
const AGENT_ID_RE = /^agent-id:[ \t]*([\w-]+)[ \t]*$/m;
const CACHE_TTL_MS = 2500;

const run = promisify(execFile);

function logRoute(line) {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
  } catch { /* fail-safe */ }
}

// ponytail: per-agent кэш 2.5с — свежесть между сообщениями, без CLI-спавна на каждый чих.
const cache = new Map();

async function resolvePlaybook(agentId) {
  const hit = cache.get(agentId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  let body = null;
  try {
    const { stdout } = await run(
      'node', [CLI, 'search', agentId, '--type', 'playbook', '--hide-superseded'],
      { cwd: PROJECT_ROOT, timeout: 5000 }
    );
    const ids = [...stdout.matchAll(/^([\w-]+) \[playbook\]/gm)].map((m) => m[1]);
    let best = null;
    let bestVersion = -1;
    for (const id of ids) {
      const { stdout: json } = await run('node', [CLI, 'get', id], { cwd: PROJECT_ROOT, timeout: 5000 });
      const obj = JSON.parse(json);
      const owner = obj.owner_skill ?? obj.extra?.owner_skill;
      if (owner !== agentId && owner !== `skill:${agentId}`) continue; // гвард владельца
      const version = Number(String(obj.version ?? '').match(/\d+/)?.[0] ?? 0);
      if (version > bestVersion) { bestVersion = version; best = obj; }
    }
    body = best?.body ?? null;
  } catch { /* fail-safe: без playbook — рамка работает через wolf search */ }
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
    } catch { /* fail-safe: не роняем сессию */ }
  },
});
