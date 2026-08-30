import { Command } from 'commander';
import {
  readPatterns,
  readSignals,
  patternThreshold,
  metricsLogPath,
  signalKey,
  type SignalEvent,
} from '../../../adapters/fs/session-metrics-log.js';
import { summarizeSignalLog } from '../../../app/use-cases/pattern-detection.js';

/**
 * Ф21 (D1.3): `wolf learn` — observability контура самообучения, только факты
 * из сигнального лога, без LLM и советов (продукт-минимум). Спека §6, §8 п.2.
 * baseDir инъектится для тестов (прецедент: memory-complain.ts).
 */

/** Краткая строка фактов сигнала: detail.message / detail.about / detail.name. */
function signalFacts(ev: SignalEvent): string {
  const d = ev.detail ?? {};
  const parts: string[] = [];
  if (typeof d.message === 'string') parts.push(`message=${d.message}`);
  if (typeof d.about === 'string') parts.push(`about=${d.about}`);
  if (typeof d.name === 'string') parts.push(`name=${d.name}`);
  return parts.join(' ');
}

function fmtShare(v: number | null): string {
  return v === null ? 'n/a' : String(v);
}

export function memoryLearnCommand(baseDir: string = process.cwd()): Command {
  const cmd = new Command('learn').description(
    'Self-learning loop observability: pattern digest and signal-log health (facts only, no LLM)'
  );

  cmd
    .command('digest')
    .description('Active patterns with live counts, recent examples and evidence refs')
    .action(() => {
      const patterns = readPatterns(baseDir);
      const signals = readSignals(baseDir);
      const threshold = patternThreshold(baseDir);
      if (patterns.length === 0) {
        console.log('активных паттернов нет');
        console.log(`сигналов в логе: ${signals.length} (порог ${threshold})`);
        return;
      }
      // live-кластеры: пересчёт signalKey по текущему логу (строки 1-based)
      const clusters = new Map<string, { ev: SignalEvent; line: number }[]>();
      for (let i = 0; i < signals.length; i++) {
        const key = signalKey(signals[i]!);
        if (key === null) continue;
        const list = clusters.get(key) ?? [];
        list.push({ ev: signals[i]!, line: i + 1 });
        clusters.set(key, list);
      }
      console.log(`активных паттернов: ${patterns.length} (порог ${threshold})`);
      for (const p of patterns) {
        const evs = clusters.get(p.key) ?? [];
        console.log(`${p.key}: count ${evs.length} (фиксирован ${p.ts} при count ${p.count})`);
        for (const { ev, line } of evs.slice(-2).reverse()) {
          const facts = signalFacts(ev);
          console.log(`  ${ev.ts}${facts ? ' ' + facts : ''} [session-metrics.jsonl:${line}]`);
        }
        console.log(`  evidence: ${evs.map((e) => `session-metrics.jsonl:${e.line}`).join(', ')}`);
      }
    });

  cmd
    .command('status')
    .description('Signal-log health: volumes, threshold, Layer 1-2 meta-metrics, last events')
    .action(() => {
      const signals = readSignals(baseDir);
      const threshold = patternThreshold(baseDir);
      const s = summarizeSignalLog(signals, threshold);
      console.log(`log: ${metricsLogPath(baseDir)}`);
      console.log(`events: ${s.totalEvents}`);
      for (const [name, count] of Object.entries(s.byEvent)) {
        console.log(`  ${name}: ${count}`);
      }
      console.log(`threshold: ${threshold}`);
      console.log('last events:');
      for (const ev of s.lastEvents) {
        const facts = signalFacts(ev);
        console.log(`  ${ev.ts} ${ev.event}${facts ? ' ' + facts : ''}`);
      }
      console.log(
        `layer1: uncategorized_errors=${s.layer1.uncategorized_errors}` +
          ` uncategorizedShare=${fmtShare(s.layer1.uncategorizedShare)}` +
          ` orphanSignals=${s.layer1.orphanSignals}` +
          ` signalCoverage=${fmtShare(s.layer1.signalCoverage)}`
      );
      console.log(
        `layer2: clusterDensity=${s.layer2.clusterDensity ?? 'n/a'}` + ` emergingPatterns=${s.layer2.emergingPatterns}`
      );
    });

  return cmd;
}
