import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
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
import { runDecayPass, decayStatus } from '../../../app/use-cases/learn-decay.js';
import {
  evolveTemplate,
  mechanicalReflector,
  TEMPLATE_CHAR_LIMIT,
  POOL_MIN,
  POOL_MAX,
} from '../../../app/use-cases/template-evolve.js';
import {
  runStopGate,
  buildScenarioFromDraft,
  zoneProbe,
  type PressureScenario,
} from '../../../domain/gates/stop-gate.js';
import { routeReviewDepth, type TaskTraits } from '../../../domain/review-depth.js';
import { getCallInjections } from '../../../app/use-cases/get-call-injections.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { resolveCreatedBy } from '../../../domain/actor.js';

/**
 * Ф21 (D1.3): `wolf learn` — observability контура самообучения, только факты
 * из сигнального лога, без LLM и советов (продукт-минимум). Спека §6, §8 п.2.
 * Ф22 (D2.2): субкоманды propose|validate|activate — draft из паттерна →
 * Sandbox Replay Holdout → активация (гейт §2.5). Спека §2.3, §2.5, §5, §6.
 * Ф23–Ф26 (D3): gate (STOP-гейт + read-only зоны), decay (TTL-пробег),
 * evolve (GEPA dry-run, гейт человека), route (AFlow-эвристики, рекомендация).
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

/** Decay-очередь пересмотра §6 (Ф26): review_required в пост-аудит-дайджесте. */
async function printDecaySection(baseDir: string): Promise<void> {
  console.log('decay queue (review_required):');
  try {
    const { store, clock } = createCliContainer(baseDir);
    const st = await decayStatus({ store, clock }, baseDir);
    if (st.reviewQueue.length === 0) {
      console.log('  пусто');
      return;
    }
    for (const q of st.reviewQueue) {
      console.log(`  ${q.id} (${q.type}): ${q.sessions} сессий без срабатывания | причина: ${q.reason}`);
    }
  } catch {
    console.log('  пусто');
  }
}

export function memoryLearnCommand(baseDir: string = safeCwd()): Command {
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
      await printDecaySection(baseDir);
    });

  cmd
    .command('status')
    .description('Signal-log health: volumes, threshold, Layer 1-2 meta-metrics, decay drift, last events')
    .action(async () => {
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
      // Ф26: drift-индикаторы актуальности (§6) — только факты
      try {
        const { store, clock } = createCliContainer(baseDir);
        const d = await decayStatus({ store, clock }, baseDir);
        console.log(
          `decay: reviewQueue=${d.reviewQueue.length} decayShare=${d.indicators.decayShare}` +
            ` reactivations(pending)=${d.indicators.reactivations} silentRules=${d.indicators.silentRules}`
        );
        console.log(
          `drift: newErrorClasses=${d.indicators.newErrorClasses.length === 0 ? 'нет' : d.indicators.newErrorClasses.join(', ')}`
        );
      } catch {
        // .wolf не инициализирован — status не падает
      }
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

  cmd
    .command('gate')
    .description('STOP-гейт (Ф23): pressure-сценарии доставки + read-only zone probe (отдельный запуск, вне check)')
    .action(async () => {
      const container = createCliContainer(baseDir);
      // сценарии из активных механических знаний (constraint_tool) + FP-проба
      const scenarios: PressureScenario[] = [];
      for (const type of ['rule', 'lesson'] as const) {
        for (const o of await container.store.list({ type, status: 'active' })) {
          const sc = buildScenarioFromDraft(o as unknown as Record<string, unknown>);
          if (sc) scenarios.push(sc);
        }
      }
      scenarios.push({
        id: 'fp-probe',
        stimulus: 'обычная задача без запретов',
        topic: 'neutral-topic-without-rules',
        expect_action: true,
      });
      // lookup синхронный по контракту harness'а — предзагружаем темы
      const cache = new Map<string, string[]>();
      for (const sc of scenarios) {
        if (cache.has(sc.topic)) continue;
        cache.set(sc.topic, (await getCallInjections(container, { topic: sc.topic })).blocks);
      }
      const report = runStopGate((topic) => cache.get(topic) ?? [], scenarios);
      console.log(`STOP-гейт: ${report.passed ? 'ЗЕЛЁНЫЙ' : 'КРАСНЫЙ'} (${scenarios.length} сценариев)`);
      for (const r of report.results) {
        console.log(`  ${r.passed ? 'PASS' : 'FAIL'} ${r.id}: ${r.reason}`);
      }
      const m = report.metrics;
      console.log(
        `layer4: stop_gate_pass_rate=${m.stop_gate_pass_rate}` +
          ` false_positive_rate=${m.false_positive_rate}` +
          ` regression_detection=${m.regression_detection}`
      );
      const probe = zoneProbe();
      const unenforced = probe.filter((z) => !z.enforced);
      console.log(`read-only зоны: ${probe.length - unenforced.length}/${probe.length} enforced`);
      for (const z of unenforced) console.log(`  НЕ ЗАЩИЩЕНА: ${z.zone}`);
      if (!report.passed || unenforced.length > 0) process.exit(1);
    });

  cmd
    .command('decay')
    .description('Ф26: decay-прогон по пробегу (сессии) — review_required-очередь, реактивация, drift')
    .option('--dry-run', 'Посчитать без записи изменений в объекты')
    .action(async (options: { dryRun?: boolean }) => {
      const { store, clock } = createCliContainer(baseDir);
      const res = await runDecayPass({ store, clock }, baseDir, { dryRun: options.dryRun === true });
      const mode = res.dryRun ? ' (dry-run)' : '';
      console.log(
        `decay-прогон${mode}: ttl_marked=${res.marked} reactivated=${res.reactivations} silent_rules=${res.silentRulesMarked}`
      );
      const st = await decayStatus({ store, clock }, baseDir);
      if (st.reviewQueue.length === 0) {
        console.log('очередь пересмотра: пусто');
      } else {
        console.log(`очередь пересмотра (${st.reviewQueue.length}):`);
        for (const q of st.reviewQueue) {
          console.log(`  ${q.id} (${q.type}): ${q.sessions} сессий | причина: ${q.reason}`);
        }
      }
      console.log(
        `drift: decayShare=${st.indicators.decayShare} silentRules=${st.indicators.silentRules}` +
          ` newErrorClasses=${st.indicators.newErrorClasses.length === 0 ? 'нет' : st.indicators.newErrorClasses.join(', ')}`
      );
      console.log('жизненный цикл: review_required — НЕ удаление; судьбу решает Стюард/пользователь в digest');
    });

  cmd
    .command('evolve <template-id>')
    .description(
      `Ф24 GEPA: кандидат vs текущий шаблон (.wolf/templates/<id>.md) по детерминированной метрике; активация — только человек`
    )
    .option('--write', 'Записать кандидат-файл <id>.candidate.md (НЕ активация; активация — гейт человека)')
    .action(async (templateId: string, options: { write?: boolean }) => {
      const templatesDir = join(baseDir, '.wolf', 'templates');
      const result = await evolveTemplate(
        {
          readFile: (p) => Promise.resolve(readFileSync(p, 'utf-8')),
          writeFile: (p, c) => {
            writeFileSync(p, c);
            return Promise.resolve();
          },
        },
        baseDir,
        {
          templateId,
          reflector: mechanicalReflector(),
          dryRun: options.write !== true,
        }
      );
      console.log(
        `шаблон: ${result.templatePath} (пул ${result.poolSize} примеров, лимит ${TEMPLATE_CHAR_LIMIT} симв.)`
      );
      console.log(
        `метрика: current ${result.comparison.currentScore.score} (${result.comparison.currentScore.prevented}/${result.comparison.currentScore.total})` +
          ` | candidate ${result.comparison.candidateScore.score} (${result.comparison.candidateScore.prevented}/${result.comparison.candidateScore.total})`
      );
      console.log(
        `парето по инстансам: candidate +${result.comparison.winsCandidate} / current +${result.comparison.winsCurrent}` +
          ` / ties ${result.comparison.ties} → verdict: ${result.comparison.verdict}`
      );
      console.log(
        result.wrote
          ? `кандидат записан: ${templateId}.candidate.md (активация — только человек)`
          : 'dry-run: ничего не записано'
      );
      console.log(
        `рефлектор: механический (LLM за интерфейсом — протокол docs/guide/steward-learn.md; пул ${POOL_MIN}–${POOL_MAX})`
      );
    });

  cmd
    .command('route')
    .description('Ф25: эвристика глубины ревью по признакам задачи (рекомендация; решение — за человеком)')
    .option('--type <t>', 'Тип задачи: feature|bugfix|refactor|docs|experiment')
    .option('--files <n>', 'Число файлов в изменении', parseInt)
    .option('--lines <n>', 'Число строк в изменении', parseInt)
    .option('--blast-radius <x>', 'Blast radius 0..1', parseFloat)
    .option('--touches-read-only', 'Изменение касается read-only зоны (гейты/логи/скелет)')
    .option('--security', 'Безопасность: доверенные границы, секреты')
    .option('--metricless', 'Нет детерминированной метрики качества')
    .action((options: Record<string, unknown>) => {
      const traits: TaskTraits = {
        ...(typeof options.type === 'string' ? { taskType: options.type as TaskTraits['taskType'] } : {}),
        ...(typeof options.files === 'number' ? { files: options.files } : {}),
        ...(typeof options.lines === 'number' ? { lines: options.lines } : {}),
        ...(typeof options.blastRadius === 'number' ? { blastRadius: options.blastRadius } : {}),
        ...(options.touchesReadOnly === true ? { touchesReadOnlyZone: true } : {}),
        ...(options.security === true ? { security: true } : {}),
        ...(options.metricless === true ? { hasDeterministicMetric: false } : {}),
      };
      const d = routeReviewDepth(traits);
      console.log(`глубина ревью: ${d.depth}`);
      for (const r of d.reasons) console.log(`  причина: ${r}`);
      console.log(
        'решение — за координатором/человеком (гейт §15); изменение эвристик — только человеком (класс «структура»)'
      );
    });

  return cmd;
}
