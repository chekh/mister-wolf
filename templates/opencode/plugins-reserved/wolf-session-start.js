/**
 * Mr.Wolf session-start plugin (base set template, spec §5.4).
 *
 * The bootstrap context injection runs whenever the current transcript
 * has NO marker — covers session start, /clear and compact (MAJ-1: no
 * per-process cache; marker gone → injection runs again). The session
 * level: agent-id marker in the system prompt — wolf-router mechanism (MAJ-4):
 * `worker-*` (L2) → truncated body without the using-skills dispatching contour;
 * L0/L1 (the rest) → recap/call + full governance set (H2).
 *
 * Zero dependencies (Node stdlib). Fail-safe: any plugin error is a silent
 * skip — never crash the session (m13). At render time, this file carries
 * the {{tool.*}} substitution and `// wolf:rendered` stamp (set by the renderer).
 */

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

// opencode contract: a plugin file has EXACTLY ONE export — the plugin factory;
// loader calls every export as a factory (a stray export line or
// a null-returning function breaks loading of the whole plugin — a defect,
// found by live dogfooding in phase C). MARKER and computeInjection are private.
const MARKER = 'Mr.Wolf session bootstrap';

// [ \t] instead of \s: \s eats newlines and pulls an id from another line.
const AGENT_ID_RE = /^agent-id:[ \t]*([\w-]+)[ \t]*$/m;

const SESSION_BODY = `## Wolf session protocol (L0/L1)

- Session start and after /clear: \`wolf call\` and \`wolf brief\` — active project guidance; they outrank static files.
- Record what matters in memory: decisions — \`wolf add --type decision\`, lessons — \`--type lesson\`, blockers — thread with status blocked; outdated — \`wolf supersede\`.
- Project state lives only in Wolf (\`wolf search\` / \`wolf get\` / \`wolf brief\`), static lists in files go stale.`;

// Single source of process discipline: the full installed SKILL.md.
// Read only when an injection is actually needed, not every turn.
// In source-tree tests the base template is available; the target project —
// only the installed skill (not a random project/base directory).
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
        return `## using-skills — skill delivered below (full text)\n\nThis is the installed skill's full text; no need to load it again. Load other skills separately before running them.\n\n${body}`;
      }
    } catch {
      // Missing/unreadable skill is a visible degraded mode, not a fake load.
    }
  }
  return `## using-skills: FALLBACK — full text unavailable

Full using-skills NOT loaded. Try the available skill mechanism;
on failure, state the limitation; do not fake the load.
Rights: L0 coordinates, L1 executes and manages, L2 neither hires agents nor commits.
Before questions and actions: new development — wolf-brainstorm; a bug — wolf-debug;
readiness claims — verification-before-completion. Load the named skill explicitly.
Approved inputs: wolf-plan/wolf-testplan → wolf-sdd or authorized wolf-execute.
Session change: wolf-handoff. Git finale: finishing-a-development-branch.
L1 locks in the FULL/LITE/FIX mode; TASK/RESULT/EVIDENCE/ACCEPTANCE keep their contracts.
Do not skip an unconfirmed mandatory stage; conversation and collecting missing context are allowed.`;
}

const WORKER_BODY = `## using-skills: worker passive mode (L2)

- You work exactly one subtask: read the assigned skills, do not browse the catalog yourself.
- The skill and the task core are delivered inside the task: take them by reference
  to the canon; do not copy the skill catalog or the core.
- Load skills before execution. Pass blockers and missing inputs to L1;
  do not start product discovery or a new thread instead of the assigned task.
- You do not hire agents or commit.
- Report per the RESULT/EVIDENCE contract with task_id.`;

/**
 * Pure injection function (unit-testable): from the transcript's marker and
 * agent-id, decides which body to deliver. null = no injection needed.
 * Shape-agnostic (v1 parts / v2 content): message parts — `m.parts` OR
 * `m.content`. Fail-safe (m13): broken input → null, never throws.
 */
function computeInjection(messages, agentId) {
  try {
    if (!Array.isArray(messages)) return null;
    // H3: idempotency — marker in ANY transcript message → do not inject.
    const seen = messages.some((m) =>
      blockList(m).some((p) => p?.type === 'text' && String(p.text ?? '').includes(MARKER))
    );
    if (seen) return null;
    // MAJ-4: worker-* → truncated body (no using-skills dispatching contour).
    return /^worker-/.test(String(agentId ?? '')) ? WORKER_BODY : `${SESSION_BODY}\n\n${governanceBody()}`;
  } catch {
    return null;
  }
}

const run = promisify(execFile);
// execFile: args array, no shell — user text never reaches the command.
// Target project — global `wolf`; dogfooding in the Wolf repo — local dist.
// P204 (wave 2.13): WOLF_SESSION is inherited across spawns — the key is set
// only when absent (same rule as wolf-router.ts: one key per
// opencode process). Session delivery deduplication works across
// spawns of one logical session.
const runWolf = (args) => {
  if (!process.env.WOLF_SESSION) process.env.WOLF_SESSION = 'opc-' + randomUUID();
  // no env field: execFile inherits all process.env (with the session key)
  const opts = {
    cwd: PROJECT_ROOT,
    timeout: TIMEOUT_MS,
  };
  return run('wolf', args, opts)
    .then((r) => r.stdout)
    .catch(() => run('node', [LOCAL_CLI, ...args], opts).then((r) => r.stdout))
    .catch(() => null);
};

// Message content blocks: v1 transcript — m.parts, v2 context — m.content.
const blockList = (message) =>
  Array.isArray(message?.parts) ? message.parts : Array.isArray(message?.content) ? message.content : [];

// Topic = first words of the first user message, for `call --for`.
const topicOf = (message) =>
  blockList(message)
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join(' ')
    .trim()
    .split(/\s+/)
    .slice(0, 10)
    .join(' ');

/** MAJ-1: NO per-process cache — every marker-less run recomputes
 *  recap/call from scratch (marker gone after /clear or compact → again).
 *  L2 (worker-*) never touches the recap/call sections at all. */
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

// MAJ-4: session level is read from the system prompt (agent-id marker in the
// agent frame body). Hook order on the first request is up to the runtime;
// until agent-id is visible, default: full set (L0/L1, primary sessions).
let currentAgentId = null;

// 4.C/P204: one WOLF_SESSION per opencode process — the v1 and v2 factories
// both set the key only when absent (spawns inherit process.env).
function ensureSession() {
  if (!process.env.WOLF_SESSION) process.env.WOLF_SESSION = 'opc-' + randomUUID();
}

// v1 factory: v1 loader calls `server()` and gets the hook object.
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
        // Fail-safe (m13): a plugin error must not crash the session.
      }
    },
  };
}

// v2 contract: v2 loader calls `setup(ctx)`. agent-id comes from the
// event.system texts (frame marker), first user by m.role, injection is a text
// block prepended to content (the mutation reaches the model request).
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
      // Fail-safe (m13): a plugin error must not crash the session.
    }
  });
}

// EXACTLY ONE export per file (opencode loader contract): dual v1/v2 entry.
export default { id: 'wolf-session-start', setup, server };
