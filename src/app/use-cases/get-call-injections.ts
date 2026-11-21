import { MemoryStore } from '../../ports/memory-store.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { Clock } from '../../ports/clock.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { tokenize } from '../../domain/solve/scenarios.js';
import { finalScore } from '../../domain/solve/relevance.js';
import { highlightFacet } from '../../domain/facet-colors.js';
import { checksumBlock } from '../../adapters/fs/session-delivery-registry.js';
import { brokenWorktreeHint, type WorktreeIdentity } from '../../adapters/fs/memory-root.js';
import { createDeliveryAdmission, createWorktreeVisibility } from './memory-delivery-admission.js';
import { detectUnaggregatedLessons } from './detect-unaggregated-lessons.js';
import {
  JournalStateUnknownError,
  JournalMigrationIncompleteError,
} from '../../adapters/fs/jsonl-micro-note-delivery-log.js';
import type { MicroNoteDeliveryLog, MicroNoteSuppressionRecord } from '../../ports/micro-note-delivery-log.port.js';
import {
  selectMicroNotes,
  type MicroNoteBudget,
  type MicroNoteContext,
  type MicroNoteDeliveryResult,
} from './micro-note-delivery.js';

export interface CallInjectionResult {
  blocks: string[];
  truncated: number;
  /** Ф26: id объектов, реально попавших в вывод (срабатывание доставки → decay-пробег). */
  deliveredIds: string[];
  /** P108 (4.C): сколько объектов отфильтровано сессионной дедупликацией
   * (id уже в реестре сессии с той же checksum блока). */
  deduplicated: number;
  /** 2.14 §7.1 (триггер 2): строка «зрелые неагрегированные уроки»; с 3.2.0 (REQ-02):
   * разбор — по поручению wolf-steward или через `wolf learn due` (learning mode
   * suggest; off — ничего не назначается), счётчик показывается без императива вызова;
   * null = relations не передан (MCP-канал) или зрелых нет. В blocks
   * не входит — не занимает бюджет доставки. */
  banner: string | null;
  /** WP3 §6.2: активных кандидатов в пуле (после status-фильтра, до scope/topic-фильтров). */
  poolSize: number;
  /** WP3 §6.2: сколько активных скрыто scope-фильтром чужого worktree; null — скрытых нет. */
  hidden: { scope: string; count: number } | null;
  /** 2.17.1 REQ-02 (R02), design §3.2: legacy-токены `worktree:<name>`, не
   * сопоставленные никому (неоднозначное имя — две живые копии с тем же basename).
   * Честный конфликт: stderr-подсказка wolf call + doctor; объекты не переписываются. */
  scopeConflicts: string[];
  /** 3.2.0 T-09 (REQ-09): адресные micro-notes; null — канал не запросил доставку
   * (input.microNotes не передан). Блоки micro-notes уже добавлены в blocks/
   * deliveredIds. */
  microNotes: MicroNoteDeliveryResult | null;
}

function formatBlock(obj: Record<string, unknown>, colors?: boolean): string {
  // P212 (2.13 §5.3в): фасет перед title — формат как в list; нет фасета → без скобок
  const facet = typeof obj.facet === 'string' ? obj.facet : null;
  const facetPart = facet ? `[${highlightFacet(facet, colors ?? false)}] ` : '';
  return `- [${obj.id}] ${facetPart}${obj.title} (${obj.confidence}, ${obj.updated_at})\n  source: ${obj.id}`;
}

/** Машино-состояние (routing-объект моделей) — не руководство для агента: в инъекции никогда. */
function isMachineState(obj: Record<string, unknown>): boolean {
  return Array.isArray(obj.tags) && (obj.tags as unknown[]).includes('wolf-routing');
}

export async function getCallInjections(
  deps: {
    store: MemoryStore;
    index?: SearchIndex;
    clock: Clock;
    relations?: RelationLog;
    /** 2.17.1 REQ-02 (R02): база идентичности копии (CLI — process.cwd()); дефолт — cwd. */
    baseDir?: string;
    /** Тестовый seam: резолвер identity (прод-дефолт — resolveWorktreeIdentity). */
    resolveIdentity?: (baseDir: string) => WorktreeIdentity | null;
    /** 3.2.0 T-09: журнал attribution micro-notes (selected/delivered, S-27
     * suppressions); не передан — доставка работает, атрибуция не пишется. */
    noteLog?: MicroNoteDeliveryLog;
  },
  input: {
    topic?: string;
    thread?: boolean | string;
    compact?: number | true;
    /** P108 (4.C): мапа id→checksum уже доставленных в сессию блоков (готовит
     * memory-call из loadSessionRegistry). Не передана (MCP-канал) — фильтр выключен. */
    deliveredRegistry?: Record<string, string>;
    /** P212 (2.13 §5.3в): подсветка фасета (CLI-TTY); false/undefined → плоский текст. */
    colors?: boolean;
    /** WP3 §6.2 + 2.17.1 REQ-02 (R02): токен текущей копии — WT-ID
     * (`w-<12 hex>` из resolveMemoryRoot().worktree, полный `worktree:…` тоже
     * принят) либо undefined/'main' — main-вид: worktree-scoped объекты скрыты. */
    currentScope?: string;
    /** 3.2.0 T-09 (REQ-09): контекст адресных micro-notes; не передан — доставка
     * micro-notes выключена (нулевое изменение поведения существующих вызовов).
     * environment не передан — берётся process.platform. */
    microNotes?: MicroNoteContext & { budget?: Partial<MicroNoteBudget> };
  }
): Promise<CallInjectionResult> {
  const now = deps.clock.now();
  const topicTokens = input.topic ? tokenize(input.topic) : [];

  // P103 (волна 2.12 A4): ровно ОДИН store.list() — list() в любом случае
  // обходит всё дерево, type/status-фильтры не сокращают IO (прецедент T013
  // в generate-agent-brief.ts). Было 5 полных проходов, один — буквальный
  // дубль rules-запроса; фильтрация по типу/статусу — в памяти.
  const memoryObjects = (await deps.store.list()) as Record<string, unknown>[];
  const activeOf = (type: string): Record<string, unknown>[] =>
    memoryObjects.filter((o) => o.type === type && o.status === 'active');

  // 1. active call-injections.
  // wave13-a §3.4 (инвариант v): call-injection поглощён note+howto; старые
  // записи читаются как note с transient alias_origin='call-injection' — пул
  // доставок находит их по alias_origin (доставка живёт до migrate; после
  // migrate alias_origin исчезает и пул их не видит — задумано спекой 8.1)
  const injections = memoryObjects.filter(
    (o) =>
      o.status === 'active' &&
      (o.type === 'call-injection' || (o.type === 'note' && o.alias_origin === 'call-injection'))
  );

  // REQ-321-2 (R-2): единая политика допуска доставки. Worktree-видимость канала
  // (2.17.1 REQ-02 design §3.2) перенесена в memory-delivery-admission.ts и теперь
  // общая с brief и микро-селектором (AC-2.4); каждая legacy-ветка отбора ниже
  // проходит предикат допуска: применимость (AC-2.2), подавление открытым
  // противоречием (AC-2.3), исключение micro-note из legacy-пути (AC-2.1).
  // REQ-333-4 (ADR-340-2): единственное чтение подавлений на вызов; утрата
  // журнала — fail-closed: подавления неизвестны → micro-notes не доставляются,
  // явная строка-уведомление добавляется в блоки вывода (подсказка restore).
  let suppressions: MicroNoteSuppressionRecord[] = [];
  let suspendedNotice: string | null = null;
  if (deps.noteLog) {
    try {
      suppressions = deps.noteLog.suppressions();
    } catch (e) {
      if (e instanceof JournalStateUnknownError) {
        suspendedNotice =
          'Micro-note delivery suspended: suppression journal state unknown — run `wolf contradict restore`';
      } else if (e instanceof JournalMigrationIncompleteError) {
        // patch 3.4.x review (F3.7): незавершённый перенос журнала — та же
        // приостановка с явным указанием, где перечень отказов; обещаний выдачи нет
        suspendedNotice =
          'Micro-note delivery suspended: journal migration is unfinished — see the refused source(s) in `wolf contradict import` / `wolf contradict restore` output; delivery stays suspended until the migration completes';
      } else {
        throw e;
      }
    }
  }
  const worktree = createWorktreeVisibility({
    currentScope: input.currentScope,
    baseDir: deps.baseDir,
    resolveIdentity: deps.resolveIdentity,
  });
  const admission = createDeliveryAdmission({
    context: input.microNotes,
    suppressions,
    worktree,
  });
  /** Допуск legacy-ветки доставки: micro-note доставляется только селектором (AC-2.1). */
  const deliverable = (o: Record<string, unknown>): boolean => admission.admitted(o).admitted;
  const visible = injections.filter(worktree.isVisible);
  const hiddenCount = injections.length - visible.length;

  // 2. topic matching
  let matched: Record<string, unknown>[];
  if (input.topic) {
    // one index query per call: injections whose body/title match the topic
    // even when trigger_keywords don't overlap (FTS fallback)
    const ftsIds = new Set<string>();
    if (deps.index && topicTokens.length > 0) {
      try {
        const results = await deps.index.search(input.topic, { type: 'call-injection', limit: 10 });
        for (const r of results) ftsIds.add(r.object.id);
      } catch {
        // ponytail: broken index degrades to keyword-only matching, never crashes wolf call
      }
    }
    matched = visible.filter((obj) => {
      // REQ-321-2: допуск единой политики до матчинга (AC-2.1..2.4).
      if (!deliverable(obj)) return false;
      const kw: string[] = (obj.trigger_keywords as string[]) ?? [];
      if (kw.some((k) => topicTokens.includes(k))) return true;
      return ftsIds.has(obj.id as string);
    });
    // D2: active lessons/rules with trigger_keywords ∩ topicTokens join the
    // match (keyword-only, no FTS for these types — deliberate simplification)
    const kwMatched = (obj: Record<string, unknown>): boolean => {
      const kw: string[] = (obj.trigger_keywords as string[]) ?? [];
      return kw.some((k) => topicTokens.includes(k));
    };
    const lessons = activeOf('lesson') as Record<string, unknown>[];
    for (const l of lessons) {
      if (deliverable(l) && kwMatched(l) && !matched.some((m) => m.id === l.id)) matched.push(l);
    }
    const rules = activeOf('rule') as Record<string, unknown>[];
    const keywordRules = rules.filter((r) => !isMachineState(r) && deliverable(r) && kwMatched(r));
    for (const r of keywordRules) {
      if (!matched.some((m) => m.id === r.id)) matched.push(r);
    }
    // 3. fallback to rules if no matches (keyword-matched rules excluded)
    if (matched.length === 0) {
      matched = rules
        .filter((r) => deliverable(r) && !isMachineState(r) && !keywordRules.some((k) => k.id === r.id))
        .slice(0, 3);
    }
  } else {
    matched = visible.filter(deliverable);
  }

  // 4. thread mode: append project rules + open blockers with matching thread
  if (input.thread !== undefined) {
    const threadId = typeof input.thread === 'string' ? input.thread : null;
    const rules = activeOf('rule') as Record<string, unknown>[];
    for (const r of rules) {
      if (!isMachineState(r) && r.scope === 'project' && deliverable(r) && !matched.some((m) => m.id === r.id)) {
        matched.push(r);
      }
    }
    if (threadId) {
      // wave13-a: blocker → note+facet pitfall (старые файлы — alias_origin);
      // «открытые блокеры треда» = активные note-pitfall с thread
      const blockers = memoryObjects.filter(
        (o) =>
          o.status === 'active' &&
          o.type === 'note' &&
          ((o.facet === 'pitfall' || o.alias_origin === 'blocker') as boolean)
      );
      for (const b of blockers) {
        if (b.thread === threadId && deliverable(b) && !matched.some((m) => m.id === b.id)) {
          matched.push(b);
        }
      }
    }
  }

  // 5. rank by D8
  const scored = matched
    .map((obj) => ({
      obj,
      score: finalScore(
        {
          ftsScore: 1,
          importance: (obj.importance as number) ?? 0.5,
          confidence: (obj.confidence as string) ?? 'medium',
          updatedAt: obj.updated_at as string,
        },
        now
      ),
    }))
    .sort((a, b) => b.score - a.score);

  // P108 (4.C): сессионная дедупликация ДО бюджета — уже доставленные в этой
  // сессии с той же checksum блока не занимают бюджет; изменившийся текст
  // (иная checksum) доставляется повторно. Реестр не передан → фильтр выключен.
  let deduplicated = 0;
  const pending = input.deliveredRegistry
    ? scored.filter(({ obj }) => {
        if (input.deliveredRegistry![obj.id as string] !== checksumBlock(formatBlock(obj, input.colors))) return true;
        deduplicated++;
        return false;
      })
    : scored;

  // 6. build blocks (deliveredIds — то, что прошло бюджет, включая fallback)
  const blocks: string[] = [];
  const deliveredIds: string[] = [];
  let truncated = 0;
  const budget = input.compact === undefined ? Infinity : input.compact === true ? 1200 : input.compact;
  let used = 0;

  for (const { obj } of pending) {
    const block = formatBlock(obj, input.colors);
    if (used + block.length <= budget) {
      blocks.push(block);
      deliveredIds.push(obj.id as string);
      used += block.length;
    } else {
      truncated++;
    }
  }

  // 6a. 3.2.0 T-09 (REQ-09): адресные micro-notes — детерминированная выборка из
  // того же прочитанного списка (без дополнительных проходов и без LLM);
  // подавленные противоречием (S-27) не доставляются; бюджет отдельный (NFR-02).
  // REQ-333-4: в loss-состоянии секция не строится — только строка приостановки.
  let micro: MicroNoteDeliveryResult | null = null;
  if (input.microNotes !== undefined && suspendedNotice !== null) {
    blocks.push(suspendedNotice);
  } else if (input.microNotes !== undefined) {
    const ctx: MicroNoteContext = {
      ...input.microNotes,
      environment: input.microNotes.environment ?? process.platform,
    };
    micro = selectMicroNotes(memoryObjects, ctx, input.microNotes.budget, suppressions, worktree);
    const deliveredSet = new Set(deliveredIds);
    // REQ-333-7 (ADR-340-6): один батч — delivered (в порядке цикла), затем
    // selected-не-delivered (прежний порядок строк; одна критическая секция)
    const deliveryRecords: Array<{
      memory_id: string;
      revision: string;
      channel: 'call';
      kind: 'delivered' | 'selected';
      ts: string;
    }> = [];
    for (const candidate of micro.delivered) {
      // Сессионная дедупликация (P108): та же checksum блока в реестре — не повторяем.
      if (input.deliveredRegistry && input.deliveredRegistry[candidate.id] === checksumBlock(candidate.block)) {
        micro.skipped.push(candidate);
        continue;
      }
      if (deliveredSet.has(candidate.id)) {
        micro.skipped.push(candidate);
        continue;
      }
      blocks.push(candidate.block);
      deliveredIds.push(candidate.id);
      deliveryRecords.push({
        memory_id: candidate.id,
        revision: candidate.revision,
        channel: 'call',
        kind: 'delivered',
        ts: now.toISOString(),
      });
    }
    if (deps.noteLog) {
      const deliveredNow = new Set(micro.delivered.map((c) => c.id));
      for (const candidate of micro.selected) {
        if (deliveredNow.has(candidate.id)) continue;
        deliveryRecords.push({
          memory_id: candidate.id,
          revision: candidate.revision,
          channel: 'call',
          kind: 'selected',
          ts: now.toISOString(),
        });
      }
      deps.noteLog.recordDeliveries(deliveryRecords);
    }
  }

  // 2.14 §7.1 (триггер 2): banner про зрелых неагрегированных — по ВСЕМ
  // объектам (не по matched); Р8 спеки: без повторной загрузки — один cast
  // уже прочитанного memoryObjects + один list() лога рёбер
  let banner: string | null = null;
  if (deps.relations) {
    const detect = detectUnaggregatedLessons(
      memoryObjects as unknown as MemoryObject[],
      await deps.relations.list(),
      now
    );
    if (detect.mature >= 1) {
      banner =
        `неагрегированных уроков: ${detect.total} (зрелых: ${detect.mature}) — ` +
        'сигнал фиксируется и не теряется; разбор — по поручению wolf-steward или через `wolf learn due`';
    }
  }

  // 2.17.1 REQ-02 (R02), design §3.2/§5: конфликт scope и битые git-метаданные —
  // stderr-подсказка wolf call (CLI-слой не меняется; вывод сюда — единственный
  // путь к stderr нетронутого memory-call.ts). Doctor подхватывает конфликт из
  // результата своей задачей (T2). Состояние видимости — в worktree (admission).
  if (worktree.conflicts().length > 0) {
    console.error(
      `[wolf] worktree scope conflict: ${worktree.conflicts().join(', ')} — ` +
        'ambiguous legacy worktree name (two live checkouts share the basename); objects stay hidden until promoted'
    );
  }
  if (worktree.currentToken === null) {
    const hint = brokenWorktreeHint(deps.baseDir ?? process.cwd());
    if (hint) console.error(`[wolf] ${hint}`);
  } else if (worktree.identity === null) {
    // design §5, второй sub-case: fs-парс .git успешен (WT-ID копии известен),
    // но git worktree list упал — legacy-разбор fail-closed; предупреждение,
    // не молчаливое скрытие (identity резолвился и вернул null; undefined —
    // git не запускался, предупреждать не о чем).
    console.error(
      `[wolf] git worktree metadata unavailable in ${deps.baseDir ?? process.cwd()} — ` +
        'legacy worktree scopes stay hidden (fail-closed)'
    );
  }

  return {
    blocks,
    truncated,
    deliveredIds,
    deduplicated,
    banner,
    poolSize: injections.length,
    hidden: hiddenCount > 0 ? { scope: input.currentScope ?? 'main', count: hiddenCount } : null,
    scopeConflicts: worktree.conflicts(),
    microNotes: micro,
  };
}
