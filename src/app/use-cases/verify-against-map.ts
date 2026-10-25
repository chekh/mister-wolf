// src/app/use-cases/verify-against-map.ts
// T5 (волна 2.19.0, REQ-11, design §«Сверка»): движок сверки проекта против
// карты обновления. Чистая функция без I/O: ожидание из карты × факт из
// исходов прохода (sync → seed → removals, design §«Проектный шаг» шаг 5).
// Исходы — структурные коды, НЕ reason-строки.
import { basename } from 'path';
import type { FaceEntry, FileEntry, FileKind, UpdateCategory, UpdateMap } from '../../adapters/fs/update-map.js';
import type { RenderOutcome } from '../../ports/base-set-renderer.port.js';
import type { SeedOutcome } from './seed-base-playbooks.js';

/** Структурные коды исхода сверки (design §«Сверка» / глоссарий). */
export type VerifyCode =
  | 'updated'
  | 'created'
  | 'removed'
  | 'seeded'
  | 'skipped-identical'
  | 'skipped-mutated'
  | 'skipped-live'
  | 'legacy-absorbed'
  | 'deprecated-noted'
  | 'unchanged'
  | 'diverged'
  | 'conflict'
  /** Правило 2 §4.3 (волна 2.20.0): файл держится ключом protect — не needs-decision. */
  | 'protected'
  /** Правило 6.5 §4.3: принятый локальный контент (origin:'keep') — не needs-decision. */
  | 'kept';

/** Коды, всегда отображаемые как «требует решения» (view-код needs-decision). */
export const NEEDS_DECISION_CODES: ReadonlySet<VerifyCode> = new Set(['skipped-mutated', 'diverged', 'conflict']);

export interface VerifyItem {
  /** Ключ цели: путь карты (files/agents_md — проектный для фактов вне карты) или шаблон лица. */
  target: string;
  kind: 'file' | 'agents-md' | 'face';
  code: VerifyCode | 'error';
  needsDecision: boolean;
  detail?: string;
}

/** Сводка проекта: счётчики исходов по кодам + «требует решения» + errors. */
export interface VerifySummary {
  byCode: Partial<Record<VerifyCode, number>>;
  needsDecision: number;
  errors: number;
}

export interface VerifyResult {
  items: VerifyItem[];
  summary: VerifySummary;
}

/**
 * Sync-исход для сверки. В RenderOutcome action='skipped' покрывает и
 * 'content identical', и 'mutated after render' (различие — только в
 * reason-строке, парсинг запрещён контрактом T5). Композитор проектного
 * шага обязан выставить структурный признак мутанта.
 */
export type SyncVerifyOutcome = RenderOutcome & { mutated?: boolean };

export interface VerifyOutcomes {
  syncOutcomes: SyncVerifyOutcome[];
  seedOutcomes: SeedOutcome[];
  /** removed-цели (проектные пути), подтверждённо отсутствующие после шага
   *  удалений: удалённые в этом проходе или отсутствовавшие ранее. */
  removals: string[];
}

/** Корень карты (по kind, генератор T1) → корень проекта (LAYOUT opencode-renderer.ts). */
const TARGET_ROOT: Record<FileKind, string> = {
  agent: '.opencode/agents/',
  skill: '.opencode/skills/',
  command: '.opencode/command/',
  plugin: '.opencode/plugins/',
};
const SOURCE_ROOT: Record<FileKind, string> = {
  agent: 'base/agents/',
  skill: 'base/skills/',
  command: 'base/commands/',
  plugin: 'opencode/plugins/',
};

/** Путь цели карты → проектный путь (LAYOUT opencode-renderer.ts). Экспорт —
 * точечный (T6): проектный шаг использует тот же перевод путей в удалениях. */
export function projectPath(entry: FileEntry): string {
  const src = SOURCE_ROOT[entry.kind];
  return entry.path.startsWith(src) ? TARGET_ROOT[entry.kind] + entry.path.slice(src.length) : entry.path;
}

/** Факт sync → код сверки. appended (AGENTS-блок init) ≈ updated. */
function syncFact(o: SyncVerifyOutcome): VerifyCode {
  // Порядок §4.6: protect/kept перекрывают ожидание категории и не являются решениями.
  if (o.protected) return 'protected';
  if (o.kept) return 'kept';
  if (o.action === 'conflict') return 'conflict';
  if (o.action === 'skipped') return o.mutated ? 'skipped-mutated' : 'skipped-identical';
  if (o.action === 'appended') return 'updated';
  return o.action;
}

/**
 * Категория карты × факт → код. Мутант и unstamped-conflict перекрывают
 * любое ожидание → «требует решения». created/updated/skipped-identical —
 * конечное состояние равно текущему рендеру (повтор прогона NFR-02 — exit 0).
 */
/**
 * Категория карты × факт → код. Мутант и unstamped-conflict перекрывают
 * любое ожидание → «требует решения», кроме deprecated: цель этой категории
 * остаётся в поставке, но только репортится (`deprecated-noted`, design §4.6) —
 * решение владельца по ней не требуется, иначе `--check` и реестр расходятся.
 */
function fileVerdict(category: UpdateCategory, fact: VerifyCode): VerifyCode {
  // Защищённая вариация и принятый локальный контент перекрывают ожидание категории (§4.6).
  if (fact === 'protected' || fact === 'kept') return fact;
  if (category === 'deprecated') {
    // «файл на месте»: identical/updated/mutated → пометка; created → файла не было
    // (удалён вручную до прохода) — факт ≠ ожиданию → «требует решения».
    return fact === 'created' ? 'conflict' : 'deprecated-noted';
  }
  if (fact === 'skipped-mutated' || fact === 'conflict') return fact;
  switch (category) {
    case 'new':
    case 'changed':
      return fact;
    case 'unchanged':
      return fact === 'skipped-identical' ? 'unchanged' : fact;
    case 'removed':
      return fact;
  }
}

function item(kind: VerifyItem['kind'], target: string, code: VerifyCode, detail?: string): VerifyItem {
  return { kind, target, code, needsDecision: NEEDS_DECISION_CODES.has(code), detail };
}

function errorItem(kind: VerifyItem['kind'], target: string, detail: string): VerifyItem {
  return { kind, target, code: 'error', needsDecision: false, detail };
}

/** Сверка проекта против карты: каждый пункт карты получает статус,
 *  факты без ожидания → conflict, отсутствие статуса → error. */
export function verifyAgainstMap(map: UpdateMap, outcomes: VerifyOutcomes): VerifyResult {
  if (!map || !Array.isArray(map.files) || !Array.isArray(map.faces) || !map.agents_md) {
    throw new Error('verifyAgainstMap: invalid update map (files/faces/agents_md are required)');
  }
  const items: VerifyItem[] = [];
  const syncByFile = new Map(outcomes.syncOutcomes.map((o) => [o.file, o]));
  const seedByTemplate = new Map(outcomes.seedOutcomes.map((o) => [o.file, o]));
  const removals = new Set(outcomes.removals);
  const seenSync = new Set<string>();
  const seenSeed = new Set<string>();
  const seenRemovals = new Set<string>();

  for (const entry of map.files) {
    const path = projectPath(entry);
    if (entry.category === 'removed') {
      if (removals.has(path)) {
        seenRemovals.add(path);
        items.push(item('file', entry.path, 'removed'));
      } else {
        // protect сильнее удаления (REQ-05, §4.3): защищённая removed-цель — факт
        // `protected`/`kept`, а не error; без факта — прежний error (fail-safe).
        const fact = syncByFile.get(path);
        if (fact?.protected || fact?.kept) {
          seenSync.add(path);
          items.push(item('file', entry.path, syncFact(fact)));
        } else {
          items.push(errorItem('file', entry.path, 'removed target got no removal status'));
        }
      }
      continue;
    }
    const fact = syncByFile.get(path);
    if (!fact) {
      items.push(errorItem('file', entry.path, `${entry.category} target got no sync outcome`));
      continue;
    }
    seenSync.add(path);
    items.push(item('file', entry.path, fileVerdict(entry.category, syncFact(fact))));
  }

  // AGENTS.md (append-block): цель в корне проекта, категория — из карты.
  const agentsFact = syncByFile.get('AGENTS.md');
  if (agentsFact) {
    seenSync.add('AGENTS.md');
    items.push(item('agents-md', 'AGENTS.md', fileVerdict(map.agents_md.category, syncFact(agentsFact))));
  } else {
    items.push(errorItem('agents-md', 'AGENTS.md', 'agents_md target got no sync outcome'));
  }

  for (const face of map.faces) {
    items.push(faceEntry(face, seedByTemplate, seenSeed));
  }

  // Факт без ожидания → conflict → «требует решения» (дрейф без объявления).
  // Защищённый orphan и принятый локальный контент остаются своими кодами (§4.6):
  // иначе санкционированная вариация снова стала бы needs-decision.
  for (const o of outcomes.syncOutcomes) {
    if (!seenSync.has(o.file)) {
      const fact = syncFact(o);
      const code = fact === 'protected' || fact === 'kept' ? fact : 'conflict';
      items.push(
        item('file', o.file, code, code === 'conflict' ? 'sync outcome for a file outside the map' : undefined)
      );
    }
  }
  for (const o of outcomes.seedOutcomes) {
    if (!seenSeed.has(o.file)) {
      items.push(item('face', o.file, 'conflict', 'seed outcome for a face outside the map'));
    }
  }
  for (const p of outcomes.removals) {
    if (!seenRemovals.has(p)) {
      items.push(item('file', p, 'conflict', 'removal of a file not declared removed in the map'));
    }
  }

  return { items, summary: summarize(items) };
}

function faceEntry(face: FaceEntry, seedByTemplate: Map<string, SeedOutcome>, seenSeed: Set<string>): VerifyItem {
  // SeedOutcome.file — базовое имя шаблона (прецедент memory-init.ts); playbooks — плоский каталог.
  const fact = seedByTemplate.get(basename(face.template));
  if (!face.seed) {
    // deprecated-шаблон лица: репортится, не мутируется (R10.4)
    if (!fact) return item('face', face.template, 'deprecated-noted');
    seenSeed.add(fact.file);
    return item('face', face.template, 'conflict', 'deprecated face template must not be seeded or updated');
  }
  if (!fact) return errorItem('face', face.template, 'seed target got no seed outcome');
  seenSeed.add(fact.file);
  if (!fact.kind) {
    return errorItem('face', face.template, 'seed outcome carries no structural kind (legacy seed mode?)');
  }
  return item('face', face.template, fact.kind);
}

function summarize(items: VerifyItem[]): VerifySummary {
  const byCode: Partial<Record<VerifyCode, number>> = {};
  let needsDecision = 0;
  let errors = 0;
  for (const it of items) {
    if (it.code === 'error') errors++;
    else byCode[it.code] = (byCode[it.code] ?? 0) + 1;
    if (it.needsDecision) needsDecision++;
  }
  return { byCode, needsDecision, errors };
}
