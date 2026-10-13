import { MemoryStore } from '../../ports/memory-store.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { Clock } from '../../ports/clock.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { tokenize } from '../../domain/solve/scenarios.js';
import { finalScore } from '../../domain/solve/relevance.js';
import { highlightFacet } from '../../domain/facet-colors.js';
import { checksumBlock } from '../../adapters/fs/session-delivery-registry.js';
import { brokenWorktreeHint, resolveWorktreeIdentity, type WorktreeIdentity } from '../../adapters/fs/memory-root.js';
import { detectUnaggregatedLessons } from './detect-unaggregated-lessons.js';

const WT_PREFIX = 'worktree:';
/** Формат WT-ID-токена (design §3.2). Свой токен сравнивается с текущим напрямую;
 * чужой WT-ID-токен НЕ сравнивается с текущим молча — падает в общий legacy-разбор
 * ниже: каталог, названный `w-<12hex>`, маппится по basename или честно конфликтует
 * (R2-01 fallthrough). */
const WT_ID_TOKEN = /^w-[0-9a-f]{12}$/;

export interface CallInjectionResult {
  blocks: string[];
  truncated: number;
  /** Ф26: id объектов, реально попавших в вывод (срабатывание доставки → decay-пробег). */
  deliveredIds: string[];
  /** P108 (4.C): сколько объектов отфильтровано сессионной дедупликацией
   * (id уже в реестре сессии с той же checksum блока). */
  deduplicated: number;
  /** 2.14 §7.1 (триггер 2): строка «зрелые неагрегированные уроки — вызвать
   * Стюарда»; null = relations не передан (MCP-канал) или зрелых нет. В blocks
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

  // 2.17.1 REQ-02 (R02), design §3.2 (ADR-1/ADR-2): ЕДИНЫЙ предикат isVisible —
  // единственная точка знания о scope; каждая ветвь отбора ниже обязана
  // пропускать кандидатов через него до ранжирования. WT-ID сравнивается строго
  // (без git); legacy-токен `worktree:<name>` маппится через идентичность копии
  // (лениво, ≤1 git-подпроцесс на процесс — NFR-01); неоднозначное имя — честный
  // конфликт (scopeConflicts), fail-closed: не видно никому.
  const current = input.currentScope ?? 'main';
  const currentToken =
    current === 'main' ? null : current.startsWith(WT_PREFIX) ? current.slice(WT_PREFIX.length) : current;
  const scopeOf = (o: Record<string, unknown>): string | null => {
    const s = o.scope;
    return typeof s === 'string' && s.startsWith(WT_PREFIX) ? s : null;
  };
  const scopeConflicts = new Set<string>();
  let identity: WorktreeIdentity | null | undefined; // undefined — ещё не резолвили (лениво)
  const identityOf = (): WorktreeIdentity | null => {
    if (identity === undefined) {
      identity = (deps.resolveIdentity ?? resolveWorktreeIdentity)(deps.baseDir ?? process.cwd());
    }
    return identity;
  };
  const isVisible = (o: Record<string, unknown>): boolean => {
    const s = scopeOf(o);
    if (s === null) return true; // main/project/global — доставляются везде (как раньше)
    if (currentToken === null) return false; // main-вид: worktree-scoped невидимы
    const token = s.slice(WT_PREFIX.length);
    // Свой WT-ID — прямое сравнение. Чужой WT-ID-токен уходит в общий
    // legacy-разбор (R2-01 fallthrough): маппинг по basename или конфликт.
    if (WT_ID_TOKEN.test(token) && token === currentToken) return true;
    const id = identityOf();
    if (id === null) return false; // сбой git-метаданных — fail-closed (design §5)
    if (token !== id.legacyName) return false;
    if (id.legacyUnique) return true; // однозначное legacy-имя маппится на эту копию
    scopeConflicts.add(s); // неоднозначное — честный конфликт, не тихое присвоение
    return false;
  };
  const visible = injections.filter(isVisible);
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
      if (isVisible(l) && kwMatched(l) && !matched.some((m) => m.id === l.id)) matched.push(l);
    }
    const rules = activeOf('rule') as Record<string, unknown>[];
    const keywordRules = rules.filter((r) => !isMachineState(r) && kwMatched(r) && isVisible(r));
    for (const r of keywordRules) {
      if (!matched.some((m) => m.id === r.id)) matched.push(r);
    }
    // 3. fallback to rules if no matches (keyword-matched rules excluded)
    if (matched.length === 0) {
      matched = rules
        .filter((r) => isVisible(r) && !isMachineState(r) && !keywordRules.some((k) => k.id === r.id))
        .slice(0, 3);
    }
  } else {
    matched = visible;
  }

  // 4. thread mode: append project rules + open blockers with matching thread
  if (input.thread !== undefined) {
    const threadId = typeof input.thread === 'string' ? input.thread : null;
    const rules = activeOf('rule') as Record<string, unknown>[];
    for (const r of rules) {
      if (!isMachineState(r) && r.scope === 'project' && isVisible(r) && !matched.some((m) => m.id === r.id)) {
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
        if (b.thread === threadId && isVisible(b) && !matched.some((m) => m.id === b.id)) {
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
        'вызовите Стюарда: opencode run --agent steward';
    }
  }

  // 2.17.1 REQ-02 (R02), design §3.2/§5: конфликт scope и битые git-метаданные —
  // stderr-подсказка wolf call (CLI-слой не меняется; вывод сюда — единственный
  // путь к stderr нетронутого memory-call.ts). Doctor подхватывает конфликт из
  // результата своей задачей (T2).
  if (scopeConflicts.size > 0) {
    console.error(
      `[wolf] worktree scope conflict: ${[...scopeConflicts].join(', ')} — ` +
        'ambiguous legacy worktree name (two live checkouts share the basename); objects stay hidden until promoted'
    );
  }
  if (currentToken === null) {
    const hint = brokenWorktreeHint(deps.baseDir ?? process.cwd());
    if (hint) console.error(`[wolf] ${hint}`);
  } else if (identity === null) {
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
    hidden: hiddenCount > 0 ? { scope: current, count: hiddenCount } : null,
    scopeConflicts: [...scopeConflicts],
  };
}
