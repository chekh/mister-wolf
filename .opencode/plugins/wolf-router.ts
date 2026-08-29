/**
 * PoC #4 (часть B): доставка playbook из памяти Wolf в системный промпт.
 *
 * Хук experimental.chat.system.transform добавляет свежий playbook на КАЖДОЕ
 * сообщение (не раз за сессию) — детерминированная доставка вместо
 * вероятностного wolf search агентом.
 *
 * ponytail: редакция — provider hook убран: в opencode 1.18.25 он регистрирует
 * только статические описания моделей (api.npm), диспатча на лету нет.
 * Роутинг моделей (часть A PoC) решается адаптером запуска: модель из памяти
 * Wolf передаётся в opencode run --model (см. .wolf/run-with-routing.sh).
 */

import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(PROJECT_ROOT, 'dist', 'bootstrap', 'cli.js');
const PLAYBOOK_ID = 'mem_20260828_apprentice_playbook_v4_lean_format_otvet_b00feb';
const LOG = path.join(PROJECT_ROOT, '.wolf', 'router.log');

const run = promisify(execFile);

function logRoute(line) {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
  } catch { /* fail-safe */ }
}

// ponytail: 2s cache — свежесть между сообщениями, без CLI-спавна на каждый чих.
let playbookCache = { value: null, at: 0 };
async function getPlaybook() {
  if (Date.now() - playbookCache.at < 2000) return playbookCache.value;
  try {
    const { stdout } = await run('node', [CLI, 'get', PLAYBOOK_ID], { cwd: PROJECT_ROOT, timeout: 5000 });
    playbookCache = { value: JSON.parse(stdout).body ?? null, at: Date.now() };
  } catch {
    playbookCache = { value: null, at: Date.now() };
  }
  return playbookCache.value;
}

export const WolfPlaybookPlugin = async () => ({
  'experimental.chat.system.transform': async (_input, output) => {
    try {
      logRoute(`transform fired, system parts=${output.system.length}, match=${output.system.join('\n').includes('apprentice-inj')}`);
      if (!output.system.join('\n').includes('apprentice-inj')) return; // только инжект-рамке
      const playbook = await getPlaybook();
      if (!playbook) return;
      output.system.push(`\n\n# Актуальный playbook (источник: память Wolf, доставлен плагином; обязательный формат ответа)\n\n${playbook}`);
      logRoute('playbook injected into system prompt');
    } catch { /* fail-safe: не роняем сессию */ }
  },
});
