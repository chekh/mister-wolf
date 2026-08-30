import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { createCliContainer } from '../../../bootstrap/container.js';
import { getLatestMemoryObject } from '../../../app/use-cases/get-latest-memory-object.js';
import { UserFacingError } from '../../../domain/errors.js';
import { extractModel, parseRunMetrics } from '../opencode-run-metrics.js';

const DEFAULT_ROUTING_ID = 'mem_20260829_llm_routing_v1_wolf_router_auto_zai_codi_966883';
const FALLBACK_MODEL = 'zai-coding-plan/glm-5.3-flash';

/** Актуальная модель по supersede-цепочке routing-объекта; любая ошибка → fallback. */
async function resolveModel(): Promise<string> {
  const routingId = process.env.WOLF_ROUTING_ID ?? DEFAULT_ROUTING_ID;
  try {
    const { store } = createCliContainer(process.cwd());
    const latest = await getLatestMemoryObject({ store }, routingId);
    const model = extractModel(latest.body);
    if (model !== null) return model;
  } catch {
    // не найдено / битая цепочка / нет модели в body → fallback, не блокируем запуск
  }
  console.error(`[wolf-run] Warning: routing object ${routingId} unresolved, using fallback model ${FALLBACK_MODEL}`);
  return FALLBACK_MODEL;
}

export function memoryRunCommand(): Command {
  return new Command('run')
    .description('Run opencode with the model from the Wolf routing object; log weighted token cost')
    .requiredOption('--agent <name>', 'opencode agent name')
    .requiredOption('--title <title>', 'Run label written to the log')
    .option('--session <sid>', 'opencode session id to continue')
    .argument('<prompt>', 'Prompt passed to opencode')
    .action(async (prompt: string, options) => {
      const model = await resolveModel();

      const args = ['run', '--format', 'json', '--agent', options.agent, '--model', model];
      if (options.session) args.push('--session', options.session);
      args.push('--', prompt);

      const child = spawn('opencode', args, { stdio: ['inherit', 'pipe', 'inherit'] });
      if (child.stdout === null) throw new UserFacingError('opencode stdout unavailable');

      const chunks: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => {
        process.stdout.write(chunk); // стримим NDJSON по мере поступления
        chunks.push(chunk);
      });

      const exitCode = await new Promise<number>((resolve, reject) => {
        child.once('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'ENOENT') reject(new UserFacingError('opencode not found in PATH'));
          else reject(err);
        });
        child.once('close', (code) => resolve(code ?? 0));
      });

      const metrics = parseRunMetrics(chunks.map(String).join(''));

      const wolfDir = join(process.cwd(), '.wolf');
      mkdirSync(wolfDir, { recursive: true });
      const logPath = join(wolfDir, 'run-log.jsonl');
      appendFileSync(
        logPath,
        JSON.stringify({
          ts: new Date().toISOString(),
          model,
          agent: options.agent,
          title: options.title,
          session: metrics.session,
          weighted: metrics.weighted,
          verdict_pending: true,
        }) + '\n'
      );

      console.error(`[wolf-run] model=${model} weighted=${metrics.weighted} log=${logPath}`);
      if (exitCode !== 0) process.exit(exitCode);
    });
}
