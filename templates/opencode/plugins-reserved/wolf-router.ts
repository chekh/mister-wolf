/**
 * Mr.Wolf router plugin (base set template, spec §5.4).
 *
 * Playbook-context delivery layer #1 (canon §7.1): deterministic delivery,
 * not probabilistic wolf search by the agent. Marker `agent-id: <id>` goes
 * IN THE BODY of the agent frame (frontmatter doesn't reach the system
 * prompt — a known pitfall) → 2.18.4: canonical face resolver (`wolf face
 * resolve`: type=face, status=active, owner_skill === agentId; exactly one
 * active face, otherwise refusal) → 2.18.5 (AC1) behavior split: unique →
 * face delivery; none → legacy note/howto/playbook search with ownership,
 * type (faces — resolver only) and status (active) guards; multiple →
 * conflict recorded, the skill is NOT selected and NOT injected; resolver
 * error → diagnosable failure — both without fallback search (review
 * 2.18.4: text fallback bypassed the conflict via a proposed face).
 * Variant B (CR-2026-10-13-02): injection memoized per opencode session
 * (a system rebuild in-session gets the sealed text of the same version —
 * no switching mid-task), cache keyed by the head note — a new session
 * always gets the current version.
 *
 * Fallback (T012, wave 1.1): skill unavailable (miss/conflict/error) →
 * built-in universal FALLBACK_PLAYBOOK injected for any agent-id.
 * In router.log (2.18.5, AC3): source=face|legacy|default,
 * resolution=unique|none|conflict|error, face_id/version/hash, session.
 * Delivery registry = playbook objects themselves via owner_skill; no
 * separate config.
 *
 * Zero dependencies (Node stdlib; ai-sdk NOT used). Fail-safe: everything in
 * try/catch — the plugin must never bring down the session (log: .wolf/router.log —
 * agent-id, name, variant, injected, ms, bytes). At render time this file receives
 * the {{tool.*}} substitution and the `// wolf:rendered` stamp (renderer-added).
 */

import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const LOCAL_CLI = path.join(PROJECT_ROOT, 'dist', 'bootstrap', 'cli.js');
// WOLF_ROUTER_LOG — test seam (unit tests write to tmp, not the live dogfood log)
const LOG = process.env.WOLF_ROUTER_LOG ?? path.join(PROJECT_ROOT, '.wolf', 'router.log');
const INJECT_HEADER = '# Current playbook (source: Wolf memory, delivered by the plugin; mandatory response format)';
// T012 (wave 1.1): built-in universal playbook for an agent-id with no canon
// in memory. Role-agnostic base contour of Wolf; canon always takes priority.
const FALLBACK_PLAYBOOK = `# Universal playbook (fallback)

There is no canonical playbook for your agent-id in Wolf memory — follow
this universal contour.

1. Session cold start: \`wolf call\` → \`wolf brief\` — the returned
   injections and brief are the active guidance of the project.
2. Record what matters in Wolf memory: decisions — \`add --type decision\`,
   lessons — \`--type lesson\`, blockers — a thread with the status blocked
   (\`thread add\` + \`transition <id> blocked\`).
3. Ask Wolf for the project state (\`wolf search\`, \`wolf get\`,
   \`wolf brief\`): static lists in files go stale.
4. Do not mutate rules and playbooks yourself — the Steward is the mutator; a systematically
   bad RULE → \`wolf complain\` (not a tool and not a one-off case).
5. A tool failure — a FRICTION line in the report (\`FRICTION: <n>× <tool> —
   reason; worked around via <what worked>\`), never silently and never as unreported retries.`;
// [ \t] instead of \s: \s eats newlines and pulls an id from a foreign line.
const AGENT_ID_RE = /^agent-id:[ \t]*([\w-]+)[ \t]*$/m;
// Spec A2: a playbook is canonical memory, the Steward mutates it rarely → 5-minute TTL.
// Variant B: freshness barrier — search runs live once per new session (memoized
// in deliverPlaybook); TTL cache saves only the get spawn on a head match,
// not the search. A negative entry (null) never reaches the hit?.value guard —
// a repeated miss of a new session re-spawns the search.
const CACHE_TTL_MS = 300_000;

// agent-id of the last frame through system.transform (B3 skill metric)
let lastAgentId: string | null = null;

// execFile: args array, no shell. Target project — global `wolf`;
// dogfood in the Wolf repo — local dist. Both fail → the exception goes up (fail-safe).
// WOLF_SESSION (4.C): key is set by the factory ONCE per opencode process —
// wolf spawns and bash calls inherit it from process.env (execFile with no
// env field inherits it). Known ceiling: several chats of one process
// share the key — conservative under-deduplication, not an error.
// 2.18.5: runWolf resolves stdout even on non-zero exit — CLI contract prints
// parseable JSON ({ok:false,error:{kind}}) to stdout with exit 1; promisify
// lost it (reject without stdout) — a real miss became an inexplicable error.
const runWolf = (args: string[]): Promise<{ stdout: string }> =>
  new Promise((resolve, reject) => {
    const attempt = (file: string, a: string[]): void => {
      execFile(file, a, { cwd: PROJECT_ROOT, timeout: 5000 }, (err, stdout) => {
        const out = typeof stdout === 'string' ? stdout : '';
        // resolve on exit 0 (empty stdout — a valid search miss) and on
        // exit≠0 with parseable output (CLI contract miss/conflict with exit 1)
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

// ponytail: per-agent cache, 5-minute TTL — canonical memory mutates rarely,
// no CLI spawn on every message. Variant B (CR-2026-10-13-02): entry keyed
// by the head key — cache saves only the get spawn, served only on an id
// match with the live search's current note; a stale version
// of the face is never served (a new session in the TTL gets the head).
const cache = new Map<string, { value: RouteResult; at: number }>();

// Variant B (a): injection memoized per opencode session. Session key is
// WOLF_SESSION (set on the opencode process; several chats of one
// process — documented ceiling, see ensureSession). Session is pinned
// to the first task's version: a system rebuild triggers no re-resolve —
// mid-task version switching is excluded (REQ-05).
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

/** Delivery outcome (2.18.5, AC1/AC3): unique — canonical face; none — no
 *  face, legacy search allowed; conflict/error — the skill is NOT selected and NOT
 *  injected (only universal fallback + diagnostics in router.log). */
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

// 2.18.4: canonical face resolver — strict type=face/status=active/
// owner_skill query (`wolf face resolve`), not probabilistic text search.
// 2.18.5 (AC1): outcomes differ — unique delivered; none → legacy path
// below; conflict/error → NO fallback to text search (review 2.18.4:
// fallback search bypassed the conflict, picking a proposed face by owner_skill).
async function resolveFaceCanonical(agentId: string): Promise<RouteResult | null> {
  let stdout: string;
  try {
    ({ stdout } = await runWolf(['face', 'resolve', agentId]));
  } catch {
    return routeFailure('error'); // both CLI forms failed without output — diagnosable failure
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
    if (parsed?.error?.kind === 'none') return null; // miss → legacy path
    return routeFailure('error'); // ok:false without kind / unparseable response
  } catch {
    return routeFailure('error');
  }
}

async function resolvePlaybook(agentId: string): Promise<RouteResult> {
  const face = await resolveFaceCanonical(agentId);
  if (face) {
    if (face.resolution === 'unique') cache.set(agentId, { value: face, at: Date.now() });
    return face; // unique | conflict | error — stop, fallback search does not override the outcome
  }
  let found: RouteResult | null = null;
  try {
    // 2.13: playbooks live as note+facet howto (type 'playbook' — legacy),
    // hence no --type; "playbook" (canon title/tags) narrows the selection.
    // Search line format: `<id> [<type>] [<facet>] <title>`.
    const { stdout } = await runWolf(['search', agentId, 'playbook', '--hide-superseded']);
    const ids = [...stdout.matchAll(/^([\w-]+) \[\w+\]/gm)].map((m) => m[1]);
    // Variant B (b): search runs live on every new session (memoized in
    // deliverPlaybook: "once per session", not "per message") — the
    // freshness barrier; the cache is served only when head-id matches
    // the selection's first line; a stale version of the face is not served.
    const hit = cache.get(agentId);
    if (hit?.value && Date.now() - hit.at < CACHE_TTL_MS && hit.value.id === ids[0]) {
      return hit.value;
    }
    // Early stop (spec A2-b): search relevance already sorted,
    // --hide-superseded cuts off old versions — the first candidate passing
    // the guards is the result (one get on a miss, not K in a row).
    // 2.18.5 (AC1): guards — owner_skill AND type (note|howto|playbook; faces
    // only via canonical resolver) AND status (active or unset;
    // proposed/superseded not delivered).
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
      if (owner !== agentId && owner !== `skill:${agentId}`) continue; // ownership guard
      if (obj.type !== 'note' && obj.type !== 'howto' && obj.type !== 'playbook') continue; // faces — resolver only
      if (obj.status !== undefined && obj.status !== 'active') continue; // status guard
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
    // 2.18.5: a legacy search failure — diagnosable error, not a silent miss
    cache.set(agentId, { value: routeFailure('error'), at: Date.now() });
    return routeFailure('error');
  }
  const result = found ?? { ...routeFailure('none'), source: 'default' as const };
  cache.set(agentId, { value: result, at: Date.now() });
  return result;
}

// B3: skill invocation metric. Input shape v1: input.tool — tool name,
// output.args — args object; v2: event.tool + event.input (name | skill —
// fallback). Separate JSONL file — invariant: SignalEventSchema event enum
// is closed, these events must not enter the shared router.log. WOLF_SKILL_LOG —
// test seam (read on every invocation: env is set by tests after import).
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
    /* fail-safe: a metric crash does not bring down the session */
  }
}

// Shared playbook delivery (v1 system.transform / v2 context): joined system text
// → agent-id marker → INJECT_HEADER idempotency guard → session memoization
// (variant B: sealed text, no re-resolve) → resolvePlaybook → push(text).
// Fail-safe: the session is never brought down on any step. 2.18.5 (AC3): every
// log line carries source/resolution/face_id/version/hash/session — shows how exactly
// the skill was delivered (canonical label is not set on a legacy result).
async function deliverPlaybook(joined: string, push: (text: string) => void): Promise<void> {
  try {
    const m = joined.match(AGENT_ID_RE);
    if (!m) return; // frame without marker — not our concern
    if (joined.includes(INJECT_HEADER)) return; // idempotency: never insert twice
    const agentId = m[1];
    lastAgentId = agentId; // agent known to the skill-metric hook (B3)
    const sessionId = process.env.WOLF_SESSION ?? '-';
    // Variant B (a): session already received the injection → serve sealed text
    // (same content, same variant), without CLI spawns or a re-resolve —
    // regardless of whether the runtime persists system text between messages.
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
      // T012: skill unavailable (miss/conflict/error) → universal fallback;
      // injection for any agent-id; conflict/failure recorded in resolution.
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
    /* fail-safe: never bring down the session */
  }
}

// 4.C: one WOLF_SESSION per opencode process — wolf spawns and bash calls
// inherit the key. Known ceiling: several chats of one process
// share it — conservative under-deduplication, not an error.
function ensureSession(): void {
  if (!process.env.WOLF_SESSION) process.env.WOLF_SESSION = 'opc-' + randomUUID();
}

// v1 factory: loader v1 calls `server()` and gets the hook object.
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

// v2 contract: loader v2 calls `setup(ctx)`; injection is a text block in
// event.system (mutation reaches the model request), metric — a tool hook.
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

// EXACTLY ONE export per file (opencode loader contract): dual v1/v2 entry.
export default { id: 'wolf-router', setup, server };
