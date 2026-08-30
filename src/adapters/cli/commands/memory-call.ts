import { Command } from 'commander';
import { getCallInjections } from '../../../app/use-cases/get-call-injections.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { resolveCreatedBy } from '../../../domain/actor.js';
import { appendDeliverySignal } from '../../../adapters/fs/session-metrics-log.js';

function parseCompact(v: string | undefined): number | true {
  if (v === undefined) return true;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : true;
}

export function memoryCallCommand(): Command {
  return new Command('call')
    .description('Get active call injections')
    .option('--for <topic>', 'Topic to match injections against')
    .option('--thread <thread-id>', 'Thread id for thread mode')
    .option('--compact [chars]', 'Compact budget in chars (default 1200)', parseCompact)
    .action(async (options: { for?: string; thread?: string; compact?: number | true }) => {
      const { store, index, clock } = createCliContainer(process.cwd());
      const result = await getCallInjections(
        { store, index, clock },
        {
          topic: options.for,
          thread: options.thread !== undefined ? options.thread : undefined,
          compact: options.compact,
        }
      );
      if (result.blocks.length === 0) {
        console.log('No active call injections.');
      } else {
        console.log(result.blocks.join('\n'));
        if (result.truncated > 0) {
          console.log(`\n[truncated: ${result.truncated} blocks omitted]`);
        }
      }
      // Ф26: доставка = срабатывание (decay-пробег сбрасывается по этим событиям,
      // спека §6). Объекты памяти НЕ обновляем (дорого) — last_triggered_at
      // вычисляет decay-прогон из лога.
      const baseDir = process.cwd();
      const actor = resolveCreatedBy(undefined);
      for (const id of result.deliveredIds) {
        appendDeliverySignal(baseDir, { name: id, mechanism: 'call', target: options.for ?? '', actor });
      }
    });
}
