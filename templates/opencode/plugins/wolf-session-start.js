/**
 * Mr.Wolf session-start plugin (шаблон базового набора, спека §5.4).
 *
 * Инъекция bootstrap-контекста выполняется, когда в актуальном транскрипте
 * НЕТ маркера — покрывает старт сессии, /clear и compact (MAJ-1: кэша на
 * процесс нет; маркер исчез → инъекция выполняется снова). Уровень сессии —
 * по agent-id маркеру в system-промпте, механизм wolf-router (MAJ-4):
 * `worker-*` (L2) → усечённое тело без диспетчерского контура using-skills;
 * L0/L1 (остальные) → recap/call + полный governance-набор (H2).
 *
 * Ноль зависимостей (Node stdlib). Fail-safe: любая ошибка плагина — тихий
 * скип, сессию не ронять (m13). Через этот файл при рендере проходят
 * подстановка {{tool.*}} и штамп `// wolf:rendered` (ставит рендерер).
 */

import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const LOCAL_CLI = path.join(PROJECT_ROOT, 'dist', 'bootstrap', 'cli.js');
const TIMEOUT_MS = 10_000;

export const MARKER = 'Mr.Wolf session bootstrap';

// [ \t] вместо \s: \s съедает переводы строк и вытаскивает id с чужой строки.
const AGENT_ID_RE = /^agent-id:[ \t]*([\w-]+)[ \t]*$/m;

const FULL_BODY = `## Протокол сессии Wolf (L0/L1)

- Начало сессии и после /clear: \`wolf call\` и \`wolf brief\` — активное руководство проекта; они приоритетнее статических файлов.
- Значимое фиксируй в памяти: \`wolf add --type decision|lesson|blocker\`; устаревшее — \`wolf supersede\`.
- Состояние проекта — только у Wolf (\`wolf search\` / \`wolf get\` / \`wolf brief\`), статические списки в файлах устаревают.

## using-skills: governance-набор (H2)

- **1%-правило**: есть хоть 1% шанс применимости скилла — загрузи через {{tool.skill}} и проверь. «Это простой вопрос», «сначала соберу контекст» — рационализации, стоп.
- **SUBAGENT-STOP**: отправлен как субагент на конкретную задачу — не диспетчь, работай по задаче.
- **Лестница приоритетов**: правила проекта/память Wolf (AGENTS.md, \`wolf search\`) > скиллы > дефолт-поведение.
- **Порядок выбора**: process-скиллы (brainstorming, systematic-debugging) ПЕРЕД implementation-скиллами.
- **Типы скиллов**: rigid — следуй точно, не адаптируй; flexible — адаптируй принципы к контексту.`;

const WORKER_BODY = `## using-skills: пассивный режим воркера (L2)

- Скиллы пассивны: читай процесс СВОЕЙ задачи, но не диспетчь и не выбирай скиллы сам — подзадача уже выдана диспетчером.
- rigid-скилл твоей задачи выполняй точно; flexible — адаптируй к контексту подзадачи.
- Red flags (кратко): «слишком просто, скиллы не нужны», «сначала соберу контекст» — сначала убедись, что процесс твоей задачи прочитан.`;

/**
 * Чистая функция инъекции (юнит-тестируемая): по маркеру в транскрипте и
 * agent-id решает, какое тело доставить. null = инъекция не нужна.
 * Fail-safe (m13): битый вход → null, никогда не бросает.
 */
export function computeInjection(messages, agentId) {
  try {
    if (!Array.isArray(messages)) return null;
    // H3: идемпотентность — маркер в ЛЮБОМ сообщении транскрипта → не инъекцируем.
    const seen = messages.some(
      (m) =>
        Array.isArray(m?.parts) &&
        m.parts.some((p) => p?.type === 'text' && String(p.text ?? '').includes(MARKER))
    );
    if (seen) return null;
    // MAJ-4: worker-* → усечённое тело (без диспетчерского контура using-skills).
    return /^worker-/.test(String(agentId ?? '')) ? WORKER_BODY : FULL_BODY;
  } catch {
    return null;
  }
}

const run = promisify(execFile);
// execFile: args array, no shell — текст пользователя не попадёт в команду.
// Целевой проект — глобальный `wolf`; догфуд в репо Wolf — локальный dist.
const runWolf = (args) => {
  const opts = { cwd: PROJECT_ROOT, timeout: TIMEOUT_MS };
  return run('wolf', args, opts)
    .then((r) => r.stdout)
    .catch(() => run('node', [LOCAL_CLI, ...args], opts).then((r) => r.stdout))
    .catch(() => null);
};

// Topic = первые слова первого пользовательского сообщения, для `call --for`.
const topicOf = (message) =>
  (message?.parts ?? [])
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join(' ')
    .trim()
    .split(/\s+/)
    .slice(0, 10)
    .join(' ');

// MAJ-4: уровень сессии читаем из system-промпта (маркер agent-id в теле
// рамки агента). Порядок хуков на первый запрос — на совести рантайма;
// пока agent-id не виден, дефолт — полный набор (L0/L1, primary-сессии).
let currentAgentId = null;

export const WolfSessionStartPlugin = async () => ({
  'experimental.chat.system.transform': async (_input, output) => {
    try {
      const m = (output?.system ?? []).join('\n').match(AGENT_ID_RE);
      currentAgentId = m ? m[1] : null;
    } catch {
      /* fail-safe */
    }
  },
  'experimental.chat.messages.transform': async (_input, output) => {
    try {
      const messages = output?.messages;
      const body = computeInjection(messages, currentAgentId);
      if (!body) return;
      const firstUser = messages.find((m) => m.info?.role === 'user');
      if (!firstUser?.parts?.length) return;

      const sections = [body];
      // MAJ-1: БЕЗ кэша на процесс — каждый запуск без маркера пересчитывает
      // recap/call заново (маркер исчез после /clear или compact → снова).
      if (!(currentAgentId ?? '').startsWith('worker-')) {
        const topic = topicOf(firstUser);
        const [recap, call] = await Promise.all([
          runWolf(['recap']),
          topic ? runWolf(['call', '--for', topic, '--compact', '600']) : null,
        ]);
        if (call?.trim()) sections.unshift(`## Active injections\n${call.trim()}`);
        if (recap?.trim()) sections.unshift(`## Recap\n${recap.trim()}`);
      }

      const ref = firstUser.parts[0];
      firstUser.parts.unshift({
        ...ref,
        type: 'text',
        text: `<session_context>\n${MARKER}\n\n${sections.join('\n\n')}\n</session_context>`,
      });
    } catch {
      // Fail-safe (m13): ошибка плагина не имеет права уронить сессию.
    }
  },
});
