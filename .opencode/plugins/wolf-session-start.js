/**
 * Mr.Wolf session-start plugin for OpenCode.
 *
 * On the first user message of a session, runs `wolf recap` (and `wolf call
 * --for <topic>` derived from that message) and injects the output as extra
 * context — so a fresh opencode session gets project state with zero manual
 * agent actions. Pattern copied from superpowers.js: user-message injection
 * via `experimental.chat.messages.transform` (no system-prompt bloat).
 *
 * Fail-safe by design: any error (no dist, no node, CLI crash, timeout)
 * silently skips the injection — never crashes the session.
 */

import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(PROJECT_ROOT, 'dist', 'bootstrap', 'cli.js');
const MARKER = 'Mr.Wolf session recap';
const TIMEOUT_MS = 10_000;

const run = promisify(execFile);
// execFile: args array, no shell — user text can't break out into a command.
const runWolf = (args) =>
  run('node', [CLI, ...args], { cwd: PROJECT_ROOT, timeout: TIMEOUT_MS }).then((r) => r.stdout);

// ponytail: one recap spawn per opencode process; transform fires per message,
// cache the promise instead of re-running.
let recapOnce = null;
const getRecap = () => (recapOnce ??= runWolf(['recap']).catch(() => null));

// Topic = first words of the first user message, for `call --for` matching.
const topicOf = (message) =>
  (message.parts ?? [])
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join(' ')
    .trim()
    .split(/\s+/)
    .slice(0, 10)
    .join(' ');

export const WolfSessionStartPlugin = async () => ({
  'experimental.chat.messages.transform': async (_input, output) => {
    try {
      const messages = output?.messages;
      if (!messages?.length) return;
      const firstUser = messages.find((m) => m.info?.role === 'user');
      if (!firstUser?.parts?.length) return;
      // Inject once per session: skip if our marker is already there.
      if (firstUser.parts.some((p) => p.type === 'text' && String(p.text ?? '').includes(MARKER))) return;

      const topic = topicOf(firstUser);
      // p.4: the transform hook gives us the first user message, so `call
      // --for` IS applicable — run it alongside recap; failure → recap only.
      const [recap, call] = await Promise.all([
        getRecap(),
        topic ? runWolf(['call', '--for', topic, '--compact', '600']).catch(() => null) : null,
      ]);

      const sections = [
        recap?.trim() ? `## Recap\n${recap.trim()}` : null,
        call?.trim() ? `## Active injections\n${call.trim()}` : null,
      ].filter(Boolean);
      if (!sections.length) return;

      const ref = firstUser.parts[0];
      firstUser.parts.unshift({
        ...ref,
        type: 'text',
        text: `<session_context>\n${MARKER}\n\n${sections.join('\n\n')}\n</session_context>`,
      });
    } catch {
      // Fail-safe: never break the session on plugin errors.
    }
  },
});
