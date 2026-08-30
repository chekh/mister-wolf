/**
 * Ф22 (D2.2): `wolf learn validate` — Sandbox Replay Holdout (спека §5).
 * Реплей draft-констрейнта на исторических событиях сигнального лога ПОСЛЕ
 * создания draft — данные, не участвовавшие в генерации (проверка transfer).
 * Вердикт детерминированный, НЕ LLM-as-a-judge: гейт обязан быть
 * воспроизводимым и дешёвым в повторных прогонах.
 */
import { MemoryStore } from '../../ports/memory-store.port.js';
import { Clock } from '../../ports/clock.port.js';
import { type MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { UserFacingError } from '../../domain/errors.js';
import type { SignalEvent } from '../../adapters/fs/session-metrics-log.js';

export interface HoldoutVerdict {
  verdict: 'pass' | 'fail' | 'needs_human_review';
  prevented: number;
  checked: number;
  note: string;
}

const NEEDS_HUMAN_NOTE = 'текстовый draft: не поддаётся механическому replay, требуется человеческое ревью';
const LEGIT_WARNING = 'легитимные использования тула не логируются — риск блокировки оценивает человек';

/** Чистая функция реплея: draft + лог → вердикт (детерминированно). */
export function replayHoldout(
  draft: {
    mechanical?: boolean;
    constraint_tool?: string;
    constraint_class?: string;
    polarity?: string;
    created_at: string;
  },
  signals: SignalEvent[]
): HoldoutVerdict {
  if (!draft.mechanical || !draft.constraint_tool) {
    return { verdict: 'needs_human_review', prevented: 0, checked: 0, note: NEEDS_HUMAN_NOTE };
  }
  // holdout-окно: tool_error после создания draft; ISO-строки сравниваются лексикографически корректно
  const holdout = signals.filter((s) => s.event === 'tool_error' && s.ts > draft.created_at);
  // negative (D2.4): анти-правило покрывает все ошибки тула, любой класс
  const negative = draft.polarity === 'negative';
  const matches = holdout.filter((s) =>
    negative
      ? s.tool_name === draft.constraint_tool
      : s.tool_name === draft.constraint_tool && s.error_class_id === draft.constraint_class
  );
  if (negative) {
    if (matches.length >= 1) {
      const classes = [...new Set(matches.map((s) => s.error_class_id ?? 'uncategorized'))];
      return {
        verdict: 'pass',
        prevented: matches.length,
        checked: holdout.length,
        note: `классы повторений: ${classes.join(', ')}; ${LEGIT_WARNING}`,
      };
    }
    return {
      verdict: 'fail',
      prevented: 0,
      checked: holdout.length,
      note: `паттерн не повторился на holdout (после создания draft) — данных для активации недостаточно; ${LEGIT_WARNING}`,
    };
  }
  if (matches.length >= 1) {
    return {
      verdict: 'pass',
      prevented: matches.length,
      checked: holdout.length,
      note: `паттерн повторился на holdout после создания draft (${matches.length} из ${holdout.length})`,
    };
  }
  return {
    verdict: 'fail',
    prevented: 0,
    checked: holdout.length,
    note: 'паттерн не повторился на holdout (после создания draft) — данных для активации недостаточно',
  };
}

/**
 * Validate: прогон holdout по draft и фиксация вердикта в объекте.
 * Idempotent: новые события в логе → повторный validate пересчитывает вердикт.
 */
export async function validateDraft(
  deps: { store: MemoryStore; clock: Clock },
  input: { draftId: string; signals: SignalEvent[] }
): Promise<HoldoutVerdict> {
  const draft = await deps.store.get(input.draftId);
  if (!draft) throw new UserFacingError(`Memory object not found: ${input.draftId}`);
  const rec = draft as Record<string, unknown>;
  if (rec.pattern_key === undefined) {
    throw new UserFacingError(`не draft propose: ${input.draftId}`);
  }
  const verdict = replayHoldout(
    {
      mechanical: rec.mechanical as boolean | undefined,
      constraint_tool: rec.constraint_tool as string | undefined,
      constraint_class: rec.constraint_class as string | undefined,
      polarity: rec.polarity as string | undefined,
      created_at: draft.created_at,
    },
    input.signals
  );
  await deps.store.update(input.draftId, {
    holdout_verdict: verdict.verdict,
    holdout_prevented: verdict.prevented,
    holdout_checked: verdict.checked,
    holdout_ts: deps.clock.now().toISOString(),
  } as Partial<MemoryObject>);
  return verdict;
}
