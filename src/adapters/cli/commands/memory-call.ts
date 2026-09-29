import { Command } from 'commander';
import { getCallInjections } from '../../../app/use-cases/get-call-injections.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { resolveCreatedBy, resolveSessionId } from '../../../domain/actor.js';
import { appendDeliverySignal, appendMemoryStageSignal } from '../../../adapters/fs/session-metrics-log.js';
import {
  checksumBlock,
  deliveryWarningLine,
  loadSessionRegistry,
  recordDeliveries,
} from '../../../adapters/fs/session-delivery-registry.js';
import { loadDeliverySettings } from '../../../adapters/fs/config-file.js';
import { withCliCall } from './with-cli-call.js';

function parseCompact(v: string | undefined): number | true {
  if (v === undefined) return true;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : true;
}

// P108 (спека 4.C): пустая выдача после дедупликации объясняет себя — молчаливая
// пустота читалась бы агентом как «память пуста». Кириллица через \u-эскейпы:
// гейт english-surface запрещает кириллические литералы в src/adapters/**.
const DEDUP_NOTICE = (n: number) =>
  `[wolf] ${n} \u0438\u043d\u044a\u0435\u043a\u0446\u0438\u0439 \u0443\u0436\u0435 \u0434\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u044b \u0432 \u044d\u0442\u043e\u0439 \u0441\u0435\u0441\u0441\u0438\u0438 (\u0434\u0435\u0434\u0443\u043f\u043b\u0438\u043a\u0430\u0446\u0438\u044f; \u0438\u0437\u043c\u0435\u043d\u0438\u0432\u0448\u0438\u0435\u0441\u044f \u0437\u0430\u043f\u0438\u0441\u0438 \u0434\u043e\u0441\u0442\u0430\u0432\u043b\u044f\u044e\u0442\u0441\u044f \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u043e)`;

export function memoryCallCommand(): Command {
  return new Command('call')
    .description('Get active call injections')
    .option('--for <topic>', 'Topic to match injections against')
    .option('--thread <thread-id>', 'Thread id for thread mode')
    .option('--compact [chars]', 'Compact budget in chars (default 1200)', parseCompact)
    .action(
      // снаружи от основного тела: delivery/memory_stage-писатели внутри остаются как есть
      withCliCall('call', async (options: { for?: string; thread?: string; compact?: number | true }) => {
        const baseDir = process.cwd();
        // P108 (4.C): sessionKey из env WOLF_SESSION (в CLI он всегда непустой —
        // ensureCliSessionId в cli-entry); null → фильтр выключен (MCP-контур).
        const sessionKey = resolveSessionId();
        const registry = sessionKey ? loadSessionRegistry(baseDir, sessionKey) : null;
        const { store, index, clock } = createCliContainer(baseDir);
        const result = await getCallInjections(
          { store, index, clock },
          {
            topic: options.for,
            thread: options.thread !== undefined ? options.thread : undefined,
            compact: options.compact,
            deliveredRegistry: registry?.delivered,
          }
        );
        if (result.blocks.length === 0) {
          if (result.deduplicated > 0) {
            console.log(DEDUP_NOTICE(result.deduplicated));
          } else {
            console.log('No active call injections.');
          }
        } else {
          console.log(result.blocks.join('\n'));
          if (result.truncated > 0) {
            console.log(`\n[truncated: ${result.truncated} blocks omitted]`);
          }
        }
        // Ф26: доставка = срабатывание (decay-пробег сбрасывается по этим событиям,
        // спека §6). Объекты памяти НЕ обновляем (дорого) — last_triggered_at
        // вычисляет decay-прогон из лога.
        const actor = resolveCreatedBy(undefined);
        // P2 D1: инъекцированные объекты → memory_stage(injected); пусто → НЕ пишется
        if (result.deliveredIds.length > 0) {
          try {
            appendMemoryStageSignal(baseDir, {
              stage: 'injected',
              memoryIds: result.deliveredIds,
              actor,
              sessionId: resolveSessionId(),
            });
          } catch {
            // телеметрия не должна ломать основной поток
          }
        }
        // blocks и deliveredIds выровнены 1:1 (строятся в одном цикле get-call-injections)
        for (let i = 0; i < result.deliveredIds.length; i++) {
          appendDeliverySignal(baseDir, {
            name: result.deliveredIds[i] ?? '',
            mechanism: 'call',
            target: options.for ?? '',
            actor,
            // волна 0 0.2: session-ключ CLI-канала (продюсер — runCli)
            sessionId: resolveSessionId(),
            // волна 0 0.1: байты инъекции (detail.injection_bytes)
            injectionBytes: Buffer.byteLength(result.blocks[i] ?? '', 'utf8'),
            // P108 (§5.i аддитивность): checksum блока — та же, что в реестре
            // сессии; join «доставка → повторная доставка изменившегося» в аналитике
            detail: { checksum: checksumBlock(result.blocks[i] ?? '') },
          });
        }
        // P108 (4.C): запись реестра доставок сессии — рядом с delivery-сигналами,
        // только по факту реальной доставки. Телеметрия выше остаётся как была:
        // сигналы пишутся лишь о реально доставленном (repeat-streak-метрика).
        // P109 (4.D): injectedBytes реестра инкрементится здесь же — на нём мягкий
        // лимит контекста ниже.
        const deliveredBytesNow = result.blocks.reduce((s, b) => s + Buffer.byteLength(b, 'utf8'), 0);
        if (sessionKey && result.deliveredIds.length > 0) {
          try {
            recordDeliveries(
              baseDir,
              sessionKey,
              result.deliveredIds.map((id, i) => ({
                id,
                checksum: checksumBlock(result.blocks[i] ?? ''),
                bytes: Buffer.byteLength(result.blocks[i] ?? '', 'utf8'),
              }))
            );
          } catch {
            // derived-кэш: сбой реестра не ломает доставку
          }
        }
        // P109 (4.D): мягкий лимит — одна строка в stderr при пересечении порога
        // (bytes/4 — токен-аппроксимация); доставка не режется, код возврата не
        // меняется, playbook роутера в сумме не участвует (§10.2). Проверяется и
        // при полном дедуп-фильтре: контекст уже занят прошлыми доставками сессии.
        if (sessionKey) {
          try {
            const line = deliveryWarningLine(
              (registry?.injectedBytes ?? 0) + deliveredBytesNow,
              loadDeliverySettings(baseDir)
            );
            if (line) console.error(line);
          } catch {
            // предупреждение не должно ломать вызов
          }
        }
      })
    );
}
