import { Command } from 'commander';
import {
  readPatterns,
  readSignals,
  patternThreshold,
  metricsLogPath,
  signalKey,
  type SignalEvent,
} from '../../../adapters/fs/session-metrics-log.js';
import { summarizeSignalLog, detectPatterns } from '../../../app/use-cases/pattern-detection.js';
import { proposeDraft } from '../../../app/use-cases/propose-draft.js';
import { validateDraft } from '../../../app/use-cases/validate-draft.js';
import { activateDraft } from '../../../app/use-cases/activate-draft.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { resolveCreatedBy } from '../../../domain/actor.js';

/**
 * Ф21 (D1.3): `wolf learn` — observability контура самообучения, только факты
 * из сигнального лога, без LLM и советов (продукт-минимум). Спека §6, §8 п.2.
 * Ф22 (D2.2): субкоманды propose|validate|activate — draft из паттерна →
 * Sandbox Replay Holdout → активация (гейт §2.5). Спека §2.3, §2.5, §5, §6.
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

/** Пост-аудит-дайджест §2.5/§6: proposed-draft'ы видимы пользователю сразу. */
async function printDraftsSection(baseDir: string): Promise<void> {
  console.log('drafts (post-audit):');
  try {
    const { store } = createCliContainer(baseDir);
    const drafts = [
      ...(await store.list({ type: 'rule', status: 'proposed' })),
      ...(await store.list({ type: 'lesson', status: 'proposed' })),
    ].filter((o) => 'pattern_key' in o);
    if (drafts.length === 0) {
      console.log('  drafts: 0');
      return;
    }
    for (const o of drafts) {
      const rec = o as Record<string, unknown>;
      console.log(
        `  ${o.id}: pattern ${rec.pattern_key} | verdict: ${rec.holdout_verdict ?? 'нет вердикта'} | by ${o.created_by}`
      );
    }
  } catch {
    // .wolf не инициализирован — деградируем честно, digest не падает
    console.log('  drafts: 0');
  }
}

export function memoryLearnCommand(baseDir: string = process.cwd()): Command {
  const cmd = new Command('learn').description(
    'Self-learning loop: pattern digest, signal-log health, draft propose/validate/activate'
  );

  cmd
    .command('digest')
    .description('Active patterns with live counts, recent examples, evidence refs and post-audit drafts')
    .action(async () => {
      const patterns = readPatterns(baseDir);
      const signals = readSignals(baseDir);
      const threshold = patternThreshold(baseDir);
      if (patterns.length === 0) {
        console.log('активных паттернов нет');
        console.log(`сигналов в логе: ${signals.length} (порог ${threshold})`);
      } else {
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
      }
      await printDraftsSection(baseDir);
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

  cmd
    .command('propose <pattern-key>')
    .description('Create a draft lesson/rule from an active pattern (mechanical generator, no LLM)')
    .option('--negative', 'Negative constraint: anti-rule banning the tool entirely')
    .option('--created-by <actor>', 'Creator actor (default: env WOLF_ACTOR, else steward:archivist)')
    .action(async (patternKey: string, options: { negative?: boolean; createdBy?: string }) => {
      const { store, log, clock, idGen, index, lock, declarations } = createCliContainer(baseDir);
      // Источник паттернов — живой пересчёт по логу (истина); patterns.jsonl —
      // только журнал фиксаций, может отставать или отсутствовать.
      const patterns = detectPatterns(readSignals(baseDir), patternThreshold(baseDir));
      const { object } = await proposeDraft(
        { store, log, clock, idGen, index, lock, declarations },
        {
          patternKey,
          patterns,
          actor: resolveCreatedBy(options.createdBy, process.env, 'steward:archivist'),
          ...(options.negative ? { polarity: 'negative' as const } : {}),
        }
      );
      const rec = object as Record<string, unknown>;
      console.log(`Draft created: ${object.id}`);
      console.log(
        `type: ${object.type} | mechanical: ${rec.mechanical ? 'да' : 'нет'} | ` +
          `polarity: ${String(rec.polarity ?? 'positive')} | count: ${String(rec.pattern_count ?? 0)}`
      );
      console.log(`evidence: ${((rec.evidence as string[]) ?? []).join(', ')}`);
    });

  cmd
    .command('validate <draft-id>')
    .description('Sandbox Replay Holdout: replay the draft on tool_error events after its creation')
    .action(async (draftId: string) => {
      const { store, clock } = createCliContainer(baseDir);
      // exit 0 при любом вердикте: вердикт зафиксирован, команда успешна
      const v = await validateDraft({ store, clock }, { draftId, signals: readSignals(baseDir) });
      console.log(`verdict: ${v.verdict} (prevented ${v.prevented} / checked ${v.checked})`);
      console.log(v.note);
    });

  cmd
    .command('activate <draft-id>')
    .description('Activate a validated draft (gate: holdout pass, or --human-approved)')
    .option('--human-approved', 'Human review override for text drafts (needs_human_review)')
    .option('--created-by <actor>', 'Actor (default: env WOLF_ACTOR, else steward:archivist)')
    .action(async (draftId: string, options: { humanApproved?: boolean; createdBy?: string }) => {
      const container = createCliContainer(baseDir);
      const draft = await container.store.get(draftId);
      const patternKey = draft ? ((draft as Record<string, unknown>).pattern_key as string | undefined) : undefined;
      await activateDraft(
        { ...container, baseDir },
        {
          draftId,
          actor: resolveCreatedBy(options.createdBy, process.env, 'steward:archivist'),
          humanApproved: options.humanApproved === true,
        }
      );
      console.log(`activated: ${draftId}`);
      console.log('delivery_event записан (mechanism call)');
      console.log(`relation recorded: ${draftId} -based_on-> pattern:${patternKey ?? '?'}`);
    });

  return cmd;
}
