/**
 * Ф24 GEPA — продукт-минимум: эволюция шаблонов брифов с детерминированной метрикой.
 * Спека: docs/superpowers/specs/2026-08-26-self-learning-design.md §3 («Жёсткое
 * ограничение применимости GEPA», «Числовые границы GEPA»), §17 B.4; roadmap-v2 Phase 24.
 *
 * Ключевые границы (M24-01..04, S24-05):
 * - рефлектор — только фронтирная модель за интерфейсом TemplateReflector;
 * - пул примеров 20–100 (M24-02);
 * - лимит длины шаблона 1500 символов (M24-03);
 * - Парето-сравнение ревизий — по инстансам, не по осям Q/C/T (S24-05);
 * - constraint-блок рефлектору против утечки примеров (M24-04);
 * - применение кандидата — только человек (N24-07 CLI activate — v1.1+):
 *   evolveTemplate пишет кандидат-файл, НЕ активирует.
 */
import { posix } from 'path';
import { readSignals, type SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import { UserFacingError } from '../../domain/errors.js';

/** Лимит длины шаблона (M24-03 [ЦИТ] Decagon: 4× компрессия при −0.8% качества). */
export const TEMPLATE_CHAR_LIMIT = 1500;
/** Пул примеров рефлексии (M24-02 [ЦИТ]: 20–100; 500 → −2% качества, 10× стоимости). */
export const POOL_MIN = 20;
export const POOL_MAX = 100;

export interface EvolveExample {
  ts: string;
  tool_name: string;
  error_class_id: string;
  message: string;
}

/** Пул примеров из tool_error-сигналов; вне границ 20–100 — отказ (M24-02). */
export function buildExamplePool(signals: SignalEvent[]): EvolveExample[] {
  const all: EvolveExample[] = signals
    .filter((s) => s.event === 'tool_error')
    .map((s) => ({
      ts: s.ts,
      tool_name: s.tool_name ?? 'unknown',
      error_class_id: s.error_class_id ?? 'uncategorized',
      message: String(s.detail?.message ?? ''),
    }));
  if (all.length < POOL_MIN) {
    throw new UserFacingError(
      `пул примеров ${all.length} < ${POOL_MIN} — GEPA-эволюция не запускается (M24-02: ${POOL_MIN}–${POOL_MAX})`
    );
  }
  // больше POOL_MAX — последние POOL_MAX по порядку файла (свежие важнее старых)
  return all.length > POOL_MAX ? all.slice(all.length - POOL_MAX) : all;
}

/**
 * LLM-рефлектор за интерфейсом — фронтир-рефлектор обязателен (M24-01 [ЦИТ] Decagon:
 * слабая модель не меняет промпт). Реализация (адаптер LLM) — вне продукт-минимума.
 */
export interface TemplateReflector {
  reflect(input: {
    templateId: string;
    current: string;
    examples: EvolveExample[];
    constraints: string[];
  }): Promise<{ candidate: string; notes?: string }>;
}

/** Constraint-блок рефлектору (M24-04): против утечки примеров в шаблон. */
export function reflectorConstraints(): string[] {
  return [
    'не копируй примеры ошибок дословно в шаблон — обобщай до воспроизводимых указаний',
    `не превышай лимит ${TEMPLATE_CHAR_LIMIT} символов (M24-03)`,
    "указания — только воспроизводимые, вида 'avoid: <tool_name>'",
  ];
}

/**
 * Механический рефлектор (детерминированный, без LLM — прецедент Ф22
 * mechanicalDraftGenerator): добавляет 'avoid: <tool>' по топ-3 тулам пула,
 * не превышая лимит. Фронтирный LLM-рефлектор (M24-01) подключается по
 * протоколу docs/guide/steward-learn.md — интерфейс тот же.
 */
export function mechanicalReflector(): TemplateReflector {
  return {
    async reflect(input) {
      const freq = new Map<string, number>();
      for (const e of input.examples) freq.set(e.tool_name, (freq.get(e.tool_name) ?? 0) + 1);
      const top = [...freq.entries()]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 3)
        .map(([tool]) => `avoid: ${tool}`)
        .filter((line) => !input.current.toLowerCase().includes(line.split(': ')[1]!.toLowerCase()));
      let candidate = input.current.trimEnd();
      for (const line of top) {
        const next = `${candidate}\n${line}`;
        if (next.length > TEMPLATE_CHAR_LIMIT) break;
        candidate = next;
      }
      return { candidate, notes: 'механический рефлектор: avoid-указания по топ-тулам пула' };
    },
  };
}

function prevents(template: string, example: EvolveExample): boolean {
  return template.toLowerCase().includes(example.tool_name.toLowerCase());
}

/**
 * ДЕТЕРМИНИРОВАННАЯ метрика (спека §3/§17 B.4: GEPA — только числовые
 * воспроизводимые метрики, никакого LLM-джаджа). Прокси-скор: «доля ошибок пула,
 * которых шаблон касался указанием» — пример считается предотвращённым, если шаблон
 * упоминает tool_name примера (подстрока, case-insensitive). Качество здесь =
 * процент предотвращённых ошибок — детерминированная воспроизводимая метрика.
 */
export function scoreTemplate(
  template: string,
  examples: EvolveExample[]
): { prevented: number; total: number; score: number } {
  const total = examples.length;
  const prevented = examples.filter((e) => prevents(template, e)).length;
  const score = total === 0 ? 0 : Number((prevented / total).toFixed(4));
  return { prevented, total, score };
}

/**
 * Парето ПО ИНСТАНСАМ (S24-05; GEPA Algorithm 2): попарно по каждому примеру —
 * предотвращён/нет у каждой ревизии. candidate_better: строго больше побед И ни один
 * инстанс не проигран; current_better — зеркально; иначе no_gain.
 */
export function compareTemplates(
  current: string,
  candidate: string,
  examples: EvolveExample[]
): {
  currentScore: ReturnType<typeof scoreTemplate>;
  candidateScore: ReturnType<typeof scoreTemplate>;
  winsCandidate: number;
  winsCurrent: number;
  ties: number;
  verdict: 'candidate_better' | 'current_better' | 'no_gain';
} {
  let winsCandidate = 0;
  let winsCurrent = 0;
  let ties = 0;
  for (const e of examples) {
    const cur = prevents(current, e);
    const cand = prevents(candidate, e);
    if (cand && !cur) winsCandidate++;
    else if (cur && !cand) winsCurrent++;
    else ties++;
  }
  const verdict =
    winsCandidate > winsCurrent && winsCurrent === 0
      ? 'candidate_better'
      : winsCurrent > winsCandidate && winsCandidate === 0
        ? 'current_better'
        : 'no_gain';
  return {
    currentScore: scoreTemplate(current, examples),
    candidateScore: scoreTemplate(candidate, examples),
    winsCandidate,
    winsCurrent,
    ties,
    verdict,
  };
}

/** Длина шаблона > 1500 символов → отказ (M24-03). */
export function validateTemplateLength(template: string, label: string): void {
  if (template.length > TEMPLATE_CHAR_LIMIT) {
    throw new UserFacingError(`шаблон ${label}: ${template.length} символов > лимита ${TEMPLATE_CHAR_LIMIT} (M24-03)`);
  }
}

function templateFile(baseDir: string, templateId: string, suffix = ''): string {
  return posix.join(baseDir, '.wolf', 'templates', `${templateId}${suffix}.md`);
}

/**
 * Один цикл GEPA-эволюции шаблона: пул из сигнального лога → рефлексия (LLM за
 * интерфейсом) → детерминированный скоринг → Парето по инстансам. dryRun=true —
 * ничего не пишет. dryRun=false — пишет ТОЛЬКО кандидат-файл <id>.candidate.md;
 * применение шаблона — гейт человека (N24-07 `templates activate` — v1.1+).
 */
export async function evolveTemplate(
  deps: {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
  },
  baseDir: string,
  input: { templateId: string; reflector: TemplateReflector; dryRun: boolean }
): Promise<{
  templatePath: string;
  candidate: string;
  current: string;
  comparison: ReturnType<typeof compareTemplates>;
  poolSize: number;
  wrote: boolean;
}> {
  const templatePath = templateFile(baseDir, input.templateId);
  let current: string;
  try {
    current = await deps.readFile(templatePath);
  } catch {
    throw new UserFacingError(
      `шаблон ${input.templateId} не найден (${templatePath}) — создайте файл шаблона, прежде чем эволюционировать`
    );
  }
  validateTemplateLength(current, 'current');
  const examples = buildExamplePool(readSignals(baseDir));
  const { candidate } = await input.reflector.reflect({
    templateId: input.templateId,
    current,
    examples,
    constraints: reflectorConstraints(),
  });
  validateTemplateLength(candidate, 'candidate');
  const comparison = compareTemplates(current, candidate, examples);
  if (input.dryRun) {
    return { templatePath, candidate, current, comparison, poolSize: examples.length, wrote: false };
  }
  await deps.writeFile(templateFile(baseDir, input.templateId, '.candidate'), candidate);
  return { templatePath, candidate, current, comparison, poolSize: examples.length, wrote: true };
}
