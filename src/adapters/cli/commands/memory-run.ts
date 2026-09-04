import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
    .option('--task-id <id>', 'Task id (written as top-level task_id; duplicated in experiment when --experiment)')
    .option('--trace-id <id>', 'Trace id (defaults to a fresh uuid)')
    .option('--attempt <n>', 'Attempt number within the task', (v: string) => parseInt(v, 10))
    .argument('<prompt>', 'Prompt passed to opencode')
    .action(async (prompt: string, options) => {
      const model = await resolveModel();
      const startedAt = Date.now();

      // P1 D3: identity прогона — run_id/trace_id/config- и prompt-подпись (v2-поля сигнала)
      const runId = randomUUID();
      const traceId = options.traceId ?? randomUUID();
      const configHash = (() => {
        try {
          return createHash('sha256')
            .update(readFileSync(join(process.cwd(), '.wolf', 'config.yaml'), 'utf-8'))
            .digest('hex')
            .slice(0, 12);
        } catch {
          return undefined; // нет конфига — нет подписи
        }
      })();
      const promptHash = createHash('sha256').update(prompt).digest('hex').slice(0, 12);

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
      // experiment без arm не записывается, как и arm без experiment.
      // P1 D3: --task-id легален и без --experiment (топ-левел task_id).
      if (options.experiment === undefined && options.arm !== undefined) {
        console.error('[wolf-run] Warning: --arm without --experiment is ignored');
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

      // P1 D3: .wolf/run-log.jsonl больше не пишется — канонический источник run-метрик
      // сигнальный лог (.wolf/metrics/session-metrics.jsonl), legacy-файл мержится на чтении.
      console.error(`[wolf-run] model=${model} weighted=${metrics.weighted} run_id=${runId} trace_id=${traceId}`);
      // Ф20 (а) + P1 D3: событие metrics в сигнальный лог контура самообучения, writer v2
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
        eventId: randomUUID(),
        runId,
        traceId,
        ...(options.attempt !== undefined && Number.isInteger(options.attempt) ? { attempt: options.attempt } : {}),
        ...(options.taskId !== undefined ? { taskId: options.taskId } : {}),
        ...(configHash !== undefined ? { configHash } : {}),
        promptHash,
        ...(options.tool.length > 0 ? { tools: options.tool } : {}),
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
