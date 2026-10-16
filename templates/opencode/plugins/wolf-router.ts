/**
 * Mr.Wolf router plugin (шаблон базового набора, спека §5.4).
 *
 * Слой доставки №1 playbook-контекста (канон §7.1): детерминированная
 * доставка вместо вероятностного wolf search агентом. Маркер
 * `agent-id: <id>` В ТЕЛЕ рамки агента (frontmatter в system-промпт не
 * попадает — известная грабля) → 2.18.4: канонический face-resolver
 * (`wolf face resolve`: type=face, status=active, owner_skill === agentId;
 * ровно одно активное лицо, иначе отказ) → 2.18.5 (AC1) поведение разделено:
 * unique → доставка лица; none → legacy-поиск note/howto/playbook с гвардами
 * владельца, типа (лица — только резолвер) и статуса (active); multiple →
 * конфликт зафиксирован, методика НЕ выбирается и НЕ внедряется; resolver
 * error → диагностируемый сбой — оба случая без запасного поиска (ревью
 * 2.18.4: текстовый fallback обходил конфликт через proposed-лицо).
 * Вариант Б (CR-2026-10-13-02): инъекция мемоизируется по opencode-сессии
 * (пересборка system в пределах сессии получает запечатанный текст той же
 * версии — без переключения посередине задания), кэш версионируется ключом
 * head-записи — новая сессия всегда получает актуальную версию.
 *
 * Fallback (T012, волна 1.1): методика недоступна (miss/conflict/error) →
 * инъекция встроенного универсального FALLBACK_PLAYBOOK для любого agent-id.
 * В router.log (2.18.5, AC3): source=face|legacy|default,
 * resolution=unique|none|conflict|error, face_id/version/hash, session.
 * Реестр доставок = сами playbook-объекты через owner_skill, отдельного
 * конфига нет.
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
   уроки — \`--type lesson\`, блокеры — thread со статусом blocked
   (\`thread add\` + \`transition <id> blocked\`).
3. Состояние проекта спрашивай у Wolf (\`wolf search\`, \`wolf get\`,
   \`wolf brief\`): статические списки в файлах устаревают.
4. Правила и playbook'ы не мутируй сам — мутатор Стюард; систематически
   плохое ПРАВИЛО → \`wolf complain\` (не тул и не разовый случай).
5. Сбой тула — FRICTION-строка в отчёте (\`FRICTION: <n>× <тул> —
   причина; обошёл через <что сработало>\`), не молча и не ретраи в стол.`;
// [ \t] вместо \s: \s съедает переводы строк и вытаскивает id с чужой строки.
const AGENT_ID_RE = /^agent-id:[ \t]*([\w-]+)[ \t]*$/m;
// Спека A2: playbook — canonical-память, Стюард мутирует редко → TTL 5 минут.
// Вариант Б: барьер свежести — search живой раз на новую сессию (мемоизация
// в deliverPlaybook); TTL-кэш экономит только get-спавн при совпадении head,
// не search. Негативная запись (null) в гвард hit?.value не попадает —
// повторный miss новой сессии снова спавнит search.
const CACHE_TTL_MS = 300_000;

// agent-id последней рамки, пропущенной через system.transform (для skill-метрики B3)
let lastAgentId: string | null = null;

// execFile: args array, no shell. Целевой проект — глобальный `wolf`;
// догфуд в репо Wolf — локальный dist. Ошибка обоих → исключение наверх (fail-safe).
// WOLF_SESSION (4.C): ключ ставится фабрикой ОДИН раз на процесс opencode —
// спавны и bash-вызовы волка наследуют его из process.env (execFile без
// env-поля наследует сам). Известный потолок: несколько чатов одного процесса
// opencode шарят ключ — консервативная недо-дедупликация, не ошибка.
// 2.18.5: runWolf резолвит stdout и при ненулевом exit — контракт CLI печатает
// разборчивый JSON ({ok:false,error:{kind}}) на stdout с exit 1; promisify
// терял его (reject без stdout), превращая реальный miss в необъяснимый error.
const runWolf = (args: string[]): Promise<{ stdout: string }> =>
  new Promise((resolve, reject) => {
    const attempt = (file: string, a: string[]): void => {
      execFile(file, a, { cwd: PROJECT_ROOT, timeout: 5000 }, (err, stdout) => {
        const out = typeof stdout === 'string' ? stdout : '';
        // resolve при exit 0 (пустой stdout — валидный miss search) и при
        // exit≠0 с разборчивым выводом (контракт CLI miss/conflict с exit 1)
        if (!err || out) return resolve({ stdout: out });
        if (file === 'wolf') return attempt('node', [LOCAL_CLI, ...args]);
        reject(err ?? new Error('wolf CLI produced no output'));
      });
    };
    attempt('wolf', args);
  });

function logRoute(line: string): void {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* fail-safe */
  }
}

// ponytail: per-agent кэш на TTL 5 мин — canonical-память мутируется редко,
// CLI-спавн не на каждое сообщение. Вариант Б (CR-2026-10-13-02): запись
// версионируется ключом head — кэш экономит только get-спавн и отдаётся лишь
// при совпадении id с актуальной записью живого search; устаревшая версия
// лица не отдаётся никогда (новая сессия в пределах TTL получает head).
const cache = new Map<string, { value: RouteResult; at: number }>();

// Вариант Б (а): мемоизация инъекции по opencode-сессии. Ключ сессии —
// WOLF_SESSION (ставится на процесс opencode; несколько чатов одного
// процесса — задокументированный потолок, см. ensureSession). Сессия
// пригвождена к версии первого задания: пересборка system не запускает
// ре-резолв — переключение версии посередине задания исключено (REQ-05).
interface InjectedPlaybook {
  text: string;
  name: string;
  variant: string;
  bytes: number;
  source: string;
  resolution: string;
  face_id: string;
  version: string;
  hash: string;
}
const sessionInject = new Map<string, InjectedPlaybook>();

/** Исход доставки (2.18.5, AC1/AC3): unique — каноническое лицо; none — лица
 *  нет, legacy-поиск разрешён; conflict/error — методика НЕ выбирается и НЕ
 *  внедряется (только универсальный fallback + диагностика в router.log). */
type RouteResolution = 'unique' | 'none' | 'conflict' | 'error';

interface RouteResult {
  id: string | null;
  body: string | null;
  source: 'face' | 'legacy' | 'default';
  resolution: RouteResolution;
  version: string | null;
  hash: string | null;
}

const routeFailure = (resolution: 'conflict' | 'error'): RouteResult => ({
  id: null,
  body: null,
  source: 'default',
  resolution,
  version: null,
  hash: null,
});

// 2.18.4: канонический резолвер лица — строгий запрос type=face/status=active/
// owner_skill (`wolf face resolve`) вместо вероятностного текстового поиска.
// 2.18.5 (AC1): результат различается — unique доставляется; none → legacy-путь
// ниже; conflict/error → НЕ fallback к текстовому поиску (ревью 2.18.4:
// запасной поиск обходил конфликт, выбирая proposed-лицо по owner_skill).
async function resolveFaceCanonical(agentId: string): Promise<RouteResult | null> {
  let stdout: string;
  try {
    ({ stdout } = await runWolf(['face', 'resolve', agentId]));
  } catch {
    return routeFailure('error'); // обе формы CLI упали без вывода — диагностируемый сбой
  }
  try {
    const parsed = JSON.parse(stdout) as {
      ok?: boolean;
      face?: { id?: unknown; body?: unknown; version?: unknown; hash?: unknown };
      error?: { kind?: unknown };
    };
    if (parsed?.ok && typeof parsed.face?.body === 'string' && parsed.face.body.length > 0) {
      return {
        id: String(parsed.face.id ?? ''),
        body: parsed.face.body,
        source: 'face',
        resolution: 'unique',
        version: typeof parsed.face.version === 'string' ? parsed.face.version : null,
        hash: typeof parsed.face.hash === 'string' ? parsed.face.hash : null,
      };
    }
    if (parsed?.error?.kind === 'multiple') return routeFailure('conflict');
    if (parsed?.error?.kind === 'none') return null; // miss → legacy-путь
    return routeFailure('error'); // ok:false без kind / неразборчивый ответ
  } catch {
    return routeFailure('error');
  }
}

async function resolvePlaybook(agentId: string): Promise<RouteResult> {
  const face = await resolveFaceCanonical(agentId);
  if (face) {
    if (face.resolution === 'unique') cache.set(agentId, { value: face, at: Date.now() });
    return face; // unique | conflict | error — стоп, запасной поиск не гасит исход
  }
  let found: RouteResult | null = null;
  try {
    // 2.13: плейбуки живут как note+facet howto (type 'playbook' — legacy),
    // поэтому без --type; слово «playbook» (title/tags канона) сужает выборку.
    // Формат строки search: `<id> [<type>] [<facet>] <title>`.
    const { stdout } = await runWolf(['search', agentId, 'playbook', '--hide-superseded']);
    const ids = [...stdout.matchAll(/^([\w-]+) \[\w+\]/gm)].map((m) => m[1]);
    // Вариант Б (б): search живой на каждой новой сессии (мемоизация в
    // deliverPlaybook гарантирует «раз на сессию», не «на сообщение») — это
    // барьер свежести; кэш отдаётся только при совпадении head-id с первой
    // строкой выборки, устаревшая версия лица не отдаётся.
    const hit = cache.get(agentId);
    if (hit?.value && Date.now() - hit.at < CACHE_TTL_MS && hit.value.id === ids[0]) {
      return hit.value;
    }
    // Ранний стоп (спека A2-б): релевантность поиска уже отсортировала,
    // --hide-superseded отсекает старые версии — первый кандидат, прошедший
    // гварды, и есть результат (один get при miss вместо K подряд).
    // 2.18.5 (AC1): гварды — owner_skill И тип (note|howto|playbook; лица
    // только через канонический резолвер) И статус (active или не задан;
    // proposed/superseded не доставляются).
    for (const id of ids) {
      const { stdout: json } = await runWolf(['get', id]);
      const obj = JSON.parse(json) as {
        id?: unknown;
        body?: unknown;
        owner_skill?: unknown;
        extra?: { owner_skill?: unknown };
        type?: unknown;
        status?: unknown;
        version?: unknown;
        hash?: unknown;
      };
      const owner = obj.owner_skill ?? obj.extra?.owner_skill;
      if (owner !== agentId && owner !== `skill:${agentId}`) continue; // гвард владельца
      if (obj.type !== 'note' && obj.type !== 'howto' && obj.type !== 'playbook') continue; // лица — только резолвер
      if (obj.status !== undefined && obj.status !== 'active') continue; // гвард статуса
      if (obj.body) {
        found = {
          id: String(obj.id ?? id),
          body: obj.body,
          source: 'legacy',
          resolution: 'none',
          version: typeof obj.version === 'string' ? obj.version : null,
          hash: typeof obj.hash === 'string' ? obj.hash : null,
        };
      }
      break;
    }
  } catch {
    // 2.18.5: сбой legacy-поиска — диагностируемый error, не молчаливый miss
    cache.set(agentId, { value: routeFailure('error'), at: Date.now() });
    return routeFailure('error');
  }
  const result = found ?? { ...routeFailure('none'), source: 'default' as const };
  cache.set(agentId, { value: result, at: Date.now() });
  return result;
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
    const file = process.env.WOLF_SKILL_LOG ?? path.join(PROJECT_ROOT, '.wolf', 'metrics', 'skill-invocations.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const entry: { ts: string; skill: string; agent?: string } = { ts: new Date().toISOString(), skill };
    if (lastAgentId) entry.agent = lastAgentId;
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
  } catch {
    /* fail-safe: падение метрики не роняет сессию */
  }
}

// Общая доставка playbook (v1 system.transform / v2 context): joined system-текст
// → маркер agent-id → гвард идемпотентности INJECT_HEADER → мемоизация сессии
// (вариант Б: запечатанный текст без ре-резолва) → resolvePlaybook → push(текст).
// Fail-safe: не роняем сессию ни на одном шаге. 2.18.5 (AC3): каждая строка
// журнала несёт source/resolution/face_id/version/hash/session — видно, как
// именно доставлена методика (canonical-метка legacy-результатом не ставится).
async function deliverPlaybook(joined: string, push: (text: string) => void): Promise<void> {
  try {
    const m = joined.match(AGENT_ID_RE);
    if (!m) return; // рамка без маркера — не наша забота
    if (joined.includes(INJECT_HEADER)) return; // идемпотентность: не вставляем дважды
    const agentId = m[1];
    lastAgentId = agentId; // агент известен хуку skill-метрики (B3)
    const sessionId = process.env.WOLF_SESSION ?? '-';
    // Вариант Б (а): сессия уже получила инъекцию → отдаём запечатанный текст
    // (то же содержание, тот же вариант), без CLI-спавнов и ре-резолва —
    // независимо от того, персистит ли рантайм system-текст между сообщениями.
    const memoKey = `${process.env.WOLF_SESSION ?? ''}:${agentId}`;
    const memoized = sessionInject.get(memoKey);
    if (memoized) {
      push(memoized.text);
      logRoute(
        `agent-id=${agentId} playbook=hit name=${memoized.name} variant=${memoized.variant}` +
          ` source=${memoized.source} resolution=${memoized.resolution} face_id=${memoized.face_id}` +
          ` version=${memoized.version} hash=${memoized.hash} session=${sessionId} injected=yes` +
          ` ms=0 bytes=${memoized.bytes}`
      );
      return;
    }
    const startedAt = Date.now();
    const resolved = await resolvePlaybook(agentId);
    const ms = Date.now() - startedAt;
    const fields =
      ` source=${resolved.source} resolution=${resolved.resolution} face_id=${resolved.source === 'face' ? (resolved.id ?? '-') : '-'}` +
      ` version=${resolved.version ?? '-'} hash=${resolved.hash ?? '-'}`;
    if (resolved.body) {
      const text = `\n\n${INJECT_HEADER}\n\n${resolved.body}`;
      sessionInject.set(memoKey, {
        text,
        name: resolved.id ?? '',
        variant: resolved.source === 'face' ? 'canonical' : 'legacy',
        bytes: Buffer.byteLength(resolved.body),
        source: resolved.source,
        resolution: resolved.resolution,
        face_id: resolved.source === 'face' ? (resolved.id ?? '-') : '-',
        version: resolved.version ?? '-',
        hash: resolved.hash ?? '-',
      });
      push(text);
      logRoute(
        `agent-id=${agentId} playbook=hit name=${resolved.id} variant=${resolved.source === 'face' ? 'canonical' : 'legacy'}` +
          `${fields} session=${sessionId} injected=yes ms=${ms} bytes=${Buffer.byteLength(resolved.body)}`
      );
    } else {
      // T012: методика недоступна (miss/conflict/error) → универсальный fallback;
      // инъекция для любого agent-id; конфликт/сбой зафиксированы в resolution.
      const text = `\n\n${INJECT_HEADER}\n\n${FALLBACK_PLAYBOOK}`;
      sessionInject.set(memoKey, {
        text,
        name: 'fallback',
        variant: 'fallback',
        bytes: Buffer.byteLength(FALLBACK_PLAYBOOK),
        source: 'default',
        resolution: resolved.resolution,
        face_id: '-',
        version: '-',
        hash: '-',
      });
      push(text);
      logRoute(
        `agent-id=${agentId} playbook=hit name=fallback variant=fallback` +
          `${fields} session=${sessionId} injected=yes ms=${ms} bytes=${Buffer.byteLength(FALLBACK_PLAYBOOK)}`
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
    hook(name: 'execute.before', fn: (event: V2ToolEvent) => Promise<void>): Promise<{ dispose: () => Promise<void> }>;
  };
}

async function setup(ctx: V2Ctx) {
  ensureSession();
  await ctx.session.hook('context', async (event) => {
    await deliverPlaybook((event?.system ?? []).map((s) => s.text).join('\n'), (text) =>
      event.system.push({ type: 'text', text })
    );
  });
  await ctx.tool.hook('execute.before', async (event) => {
    recordSkillMetric(event.tool, event.input);
  });
}

// РОВНО ОДИН export на файл (контракт loader'а opencode): dual v1/v2 entry.
export default { id: 'wolf-router', setup, server };
