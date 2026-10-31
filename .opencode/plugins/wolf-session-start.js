// wolf:rendered base=wolf-session-start.js set=2.22.0
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
 * подстановка {{tool.*}} и штамп ` */

import path from 'path';
import { readFileSync } from 'fs';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const LOCAL_CLI = path.join(PROJECT_ROOT, 'dist', 'bootstrap', 'cli.js');
const TIMEOUT_MS = 10_000;

// Контракт opencode: у файла плагина РОВНО ОДИН export — фабрика плагина;
// loader вызывает каждый export как фабрику (лишний export-строка или
// функция, возвращающая null, валит загрузку всего плагина — дефект,
// найден живым догфудингом фазы C). MARKER и computeInjection — приватные.
const MARKER = 'Mr.Wolf session bootstrap';

// [ \t] вместо \s: \s съедает переводы строк и вытаскивает id с чужой строки.
const AGENT_ID_RE = /^agent-id:[ \t]*([\w-]+)[ \t]*$/m;

const SESSION_BODY = `## Протокол сессии Wolf (L0/L1)

- Начало сессии и после /clear: \`wolf call\` и \`wolf brief\` — активное руководство проекта; они приоритетнее статических файлов.
- Значимое фиксируй в памяти: решения — \`wolf add --type decision\`, уроки — \`--type lesson\`, блокеры — thread со статусом blocked; устаревшее — \`wolf supersede\`.
- Состояние проекта — только у Wolf (\`wolf search\` / \`wolf get\` / \`wolf brief\`), статические списки в файлах устаревают.`;

// Один источник процессной дисциплины: полный установленный SKILL.md.
// Чтение происходит только при реально нужной инъекции, не на каждый ход.
// В source-tree тестах доступен base-шаблон; в целевом проекте — только
// установленный скилл (не случайный project/base каталог).
function governanceBody() {
  const candidates = [path.join(__dirname, '..', 'skills', 'using-skills', 'SKILL.md')];
  if (path.basename(path.resolve(__dirname, '..', '..')) === 'templates') {
    candidates.push(path.join(__dirname, '..', '..', 'base', 'skills', 'using-skills', 'SKILL.md'));
  }
  for (const candidate of candidates) {
    try {
      const raw = readFileSync(candidate, 'utf8');
      const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
      const body = match?.[1]?.trim();
      if (body) {
        return `## using-skills: полный текст уже загружен\n\nНе вызывай using-skills повторно ради загрузки. Другие методики загружай отдельно до их выполнения.\n\n${body}`;
      }
    } catch {
      // Missing/unreadable skill is a visible degraded mode, not a fake load.
    }
  }
  return `## using-skills: FALLBACK — полный текст недоступен

Полный using-skills НЕ загружен. Попробуй доступный механизм скиллов;
при неудаче обозначь ограничение, не имитируй загрузку.
Полномочия: L0 координирует, L1 исполняет и управляет, L2 не спавнит и не коммитит.
До вопросов и действий: новая разработка — wolf-brainstorm; баг — wolf-debug;
заявление о готовности — verification-before-completion. Названный скилл загрузи явно.
Утверждённые входы: wolf-plan/wolf-testplan → wolf-sdd либо разрешённый wolf-execute.
Смена сессии: wolf-handoff. Git-финал: finishing-a-development-branch.
Режим FULL/LITE/FIX фиксирует L1; TASK/RESULT/EVIDENCE/ACCEPTANCE сохраняют свои контракты.
Не переходи через неподтверждённый обязательный этап; разговор и сбор недостающего контекста возможны.`;
}

const WORKER_BODY = `## using-skills: пассивный режим воркера (L2)

- Работаешь ровно одну подзадачу: читаешь назначенные скиллы, каталог сам не перебираешь.
- Методика и ядро поручения доставлены в самом поручении: бери их по ссылке
  на канон, копию каталога скиллов и ядра не переноси.
- Методики загружай до исполнения. Блокер и недостающие входы передай L1;
  не начинай продуктовый discovery и новый тред вместо назначенной задачи.
- Не спавнишь агентов и не коммитишь.
- Отчёт по контракту RESULT/EVIDENCE с task_id.`;

/**
 * Чистая функция инъекции (юнит-тестируемая): по маркеру в транскрипте и
 * agent-id решает, какое тело доставить. null = инъекция не нужна.
 * Shape-agnostic (v1 parts / v2 content): части сообщения — `m.parts` ИЛИ
 * `m.content`. Fail-safe (m13): битый вход → null, никогда не бросает.
 */
function computeInjection(messages, agentId) {
  try {
    if (!Array.isArray(messages)) return null;
    // H3: идемпотентность — маркер в ЛЮБОМ сообщении транскрипта → не инъекцируем.
    const seen = messages.some((m) =>
      blockList(m).some((p) => p?.type === 'text' && String(p.text ?? '').includes(MARKER))
    );
    if (seen) return null;
    // MAJ-4: worker-* → усечённое тело (без диспетчерского контура using-skills).
    return /^worker-/.test(String(agentId ?? '')) ? WORKER_BODY : `${SESSION_BODY}\n\n${governanceBody()}`;
  } catch {
    return null;
  }
}

const run = promisify(execFile);
// execFile: args array, no shell — текст пользователя не попадёт в команду.
// Целевой проект — глобальный `wolf`; догфуд в репо Wolf — локальный dist.
// P204 (волна 2.13): WOLF_SESSION наследуется между спавнами — ключ ставится
// только при отсутствии (то же правило, что wolf-router.ts: один ключ на
// процесс opencode). Сессионная дедупликация доставок работает между
// спавнами одной логической сессии.
const runWolf = (args) => {
  if (!process.env.WOLF_SESSION) process.env.WOLF_SESSION = 'opc-' + randomUUID();
  // env-поля нет: execFile наследует process.env целиком (с ключом сессии)
  const opts = {
    cwd: PROJECT_ROOT,
    timeout: TIMEOUT_MS,
  };
  return run('wolf', args, opts)
    .then((r) => r.stdout)
    .catch(() => run('node', [LOCAL_CLI, ...args], opts).then((r) => r.stdout))
    .catch(() => null);
};

// Блоки контента сообщения: v1 транскрипт — m.parts, v2 context — m.content.
const blockList = (message) =>
  Array.isArray(message?.parts) ? message.parts : Array.isArray(message?.content) ? message.content : [];

// Topic = первые слова первого пользовательского сообщения, для `call --for`.
const topicOf = (message) =>
  blockList(message)
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join(' ')
    .trim()
    .split(/\s+/)
    .slice(0, 10)
    .join(' ');

/** MAJ-1: БЕЗ кэша на процесс — каждый запуск без маркера пересчитывает
 *  recap/call заново (маркер исчез после /clear или compact → снова).
 *  L2 (worker-*) секции recap/call не трогает вообще. */
async function buildSections(body, firstUser, agentId) {
  const sections = [body];
  if (!(agentId ?? '').startsWith('worker-')) {
    const topic = topicOf(firstUser);
    const [recap, call] = await Promise.all([
      runWolf(['recap']),
      topic ? runWolf(['call', '--for', topic, '--compact', '600']) : null,
    ]);
    if (call?.trim()) sections.unshift(`## Active injections\n${call.trim()}`);
    if (recap?.trim()) sections.unshift(`## Recap\n${recap.trim()}`);
  }
  return sections;
}

const wrap = (sections) =>
  `<session_context>\n${MARKER}\n\n${sections.join('\n\n')}\n</session_context>`;

// MAJ-4: уровень сессии читаем из system-промпта (маркер agent-id в теле
// рамки агента). Порядок хуков на первый запрос — на совести рантайма;
// пока agent-id не виден, дефолт — полный набор (L0/L1, primary-сессии).
let currentAgentId = null;

// 4.C/P204: один WOLF_SESSION на процесс opencode — и v1-, и v2-фабрика
// ставят ключ только при отсутствии (спавны наследуют process.env).
function ensureSession() {
  if (!process.env.WOLF_SESSION) process.env.WOLF_SESSION = 'opc-' + randomUUID();
}

// v1-фабрика: loader v1 вызывает `server()` и получает hook-объект.
async function server() {
  ensureSession();
  return {
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

        const sections = await buildSections(body, firstUser, currentAgentId);
        const ref = firstUser.parts[0];
        firstUser.parts.unshift({
          ...ref,
          type: 'text',
          text: wrap(sections),
        });
      } catch {
        // Fail-safe (m13): ошибка плагина не имеет права уронить сессию.
      }
    },
  };
}

// v2-контракт: loader v2 вызывает `setup(ctx)`. agent-id — из текстов
// event.system (маркер рамки), первый user — по m.role, инъекция — text-блок
// в начало content (мутация доходит до модельного запроса).
async function setup(ctx) {
  ensureSession();
  await ctx.session.hook('context', async (event) => {
    try {
      const messages = event?.messages;
      const systemText = (event?.system ?? []).map((s) => s?.text ?? '').join('\n');
      const m = systemText.match(AGENT_ID_RE);
      currentAgentId = m ? m[1] : typeof event?.agent === 'string' ? event.agent : null;
      const body = computeInjection(messages, currentAgentId);
      if (!body) return;
      const firstUser = Array.isArray(messages) ? messages.find((mm) => mm?.role === 'user') : null;
      if (!Array.isArray(firstUser?.content) || firstUser.content.length === 0) return;

      const sections = await buildSections(body, firstUser, currentAgentId);
      firstUser.content.unshift({ type: 'text', text: wrap(sections) });
    } catch {
      // Fail-safe (m13): ошибка плагина не имеет права уронить сессию.
    }
  });
}

// РОВНО ОДИН export на файл (контракт loader'а opencode): dual v1/v2 entry.
export default { id: 'wolf-session-start', setup, server };
