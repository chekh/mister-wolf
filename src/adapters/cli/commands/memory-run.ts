import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Command, Option } from 'commander';
import { createCliContainer } from '../../../bootstrap/container.js';
import { getLatestMemoryObject } from '../../../app/use-cases/get-latest-memory-object.js';
import { UserFacingError } from '../../../domain/errors.js';
import { resolveCreatedBy } from '../../../domain/actor.js';
import { extractModel, parseRunMetrics } from '../opencode-run-metrics.js';
import { appendRunSignal, recordToolError } from '../../../adapters/fs/session-metrics-log.js';

const DEFAULT_ROUTING_ID = 'mem_20260829_llm_routing_v1_wolf_router_auto_zai_codi_966883';
const FALLBACK_MODEL = 'zai-coding-plan/glm-5.3-flash';

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

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
    .option('--tool <name>', 'Mark this run as using tool(s) (repeatable)', collect, [])
    .option('--experiment <id>', 'Experiment id (comparative methodologies, e.g. RCT)')
    .addOption(new Option('--arm <choice>', 'Experiment arm').choices(['wolf', 'baseline']))
    .option('--task-id <id>', 'Task id within the experiment (golden tasks)')
    .argument('<prompt>', 'Prompt passed to opencode')
    .action(async (prompt: string, options) => {
      const model = await resolveModel();
      const startedAt = Date.now();

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
      }).catch((err: unknown) => {
        // Ф20 (г): ошибка запуска тула — сигнал через классификатор, лог не роняем
        if (err instanceof UserFacingError) {
          recordToolError(process.cwd(), {
            tool_name: 'opencode',
            message: err.message,
            task: options.title,
            agent: options.agent,
          });
        }
        throw err;
      });

      const metrics = parseRunMetrics(chunks.map(String).join(''));

      // M1 (D4): wall-clock длительность прогона
      const durationMs = Date.now() - startedAt;

      // M1 (D5): experiment пишется только полным набором --experiment + --arm;
      // arm — union 'wolf' | 'baseline' (обязателен в типе сигнала), поэтому
      // experiment без arm не записывается, как и arm/task-id без experiment
      if (options.experiment === undefined && (options.arm !== undefined || options.taskId !== undefined)) {
        console.error('[wolf-run] Warning: --arm/--task-id without --experiment are ignored');
      }
      if (options.experiment !== undefined && options.arm === undefined) {
        console.error('[wolf-run] Warning: --experiment without --arm: experiment fields are not recorded');
      }
      const experiment =
        options.experiment !== undefined && options.arm !== undefined
          ? {
              id: options.experiment as string,
              arm: options.arm as string,
              ...(options.taskId !== undefined ? { task_id: options.taskId as string } : {}),
            }
          : undefined;

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
          duration_ms: durationMs,
          tokens: { input: metrics.tokensIn, output: metrics.tokensOut, cache_read: metrics.cacheRead },
          ...(experiment !== undefined ? { experiment } : {}),
          ...(options.tool.length > 0 ? { tools: options.tool } : {}),
        }) + '\n'
      );

      console.error(`[wolf-run] model=${model} weighted=${metrics.weighted} log=${logPath}`);
      // Ф20 (а): событие metrics в сигнальный лог контура самообучения
      appendRunSignal(process.cwd(), {
        model,
        agent: options.agent,
        title: options.title,
        session: metrics.session,
        weighted: metrics.weighted,
        outcome: exitCode === 0 ? 'ok' : `exit_${exitCode}`,
        actor: resolveCreatedBy(undefined),
        durationMs,
        tokens: { input: metrics.tokensIn, output: metrics.tokensOut, cache_read: metrics.cacheRead },
        ...(experiment !== undefined
          ? {
              experiment: {
                id: experiment.id,
                arm: experiment.arm as 'wolf' | 'baseline',
                ...(options.taskId !== undefined ? { taskId: options.taskId as string } : {}),
              },
            }
          : {}),
      });
      if (exitCode !== 0) process.exit(exitCode);
    });
}
