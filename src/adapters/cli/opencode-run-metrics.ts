/**
 * Чистые функции для `wolf run`: извлечение модели из routing-объекта
 * и подсчёт weighted-метрик из NDJSON-потока opencode. Без side-effects.
 */

const MODEL_RE = /([\w.\-]+\/[\w.\-]+)\s*\(providerID/;

/** Модель из body routing-объекта (`org/model (providerID=...)`), null если не найдена. */
export function extractModel(body: string): string | null {
  const match = MODEL_RE.exec(body);
  return match ? match[1] : null;
}

export interface RunMetrics {
  session: string | null;
  weighted: number;
  stepFinishes: number;
  /** M1 (D3, Q7): Σ tokens.input по step-finish — сырые токены рядом с weighted. */
  tokensIn: number;
  /** M1: Σ tokens.output по step-finish. */
  tokensOut: number;
  /** M1: Σ tokens.cache.read по step-finish. */
  cacheRead: number;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * weighted = Σ по всем step-finish событиям: input + 0.1 × cache.read + 5 × output.
 * M1: рядом с weighted суммируются сырые токены (tokensIn/tokensOut/cacheRead).
 * Малформ-строки молча пропускаются. sessionID — из любого события
 * (верхнего уровня или part.sessionID).
 */
export function parseRunMetrics(ndjsonText: string): RunMetrics {
  let session: string | null = null;
  let weighted = 0;
  let stepFinishes = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let cacheRead = 0;
  for (const rawLine of ndjsonText.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const event = parsed as { sessionID?: unknown; part?: unknown };
    if (session === null && typeof event.sessionID === 'string') session = event.sessionID;
    if (typeof event.part !== 'object' || event.part === null) continue;
    const part = event.part as { type?: unknown; sessionID?: unknown; tokens?: unknown };
    if (session === null && typeof part.sessionID === 'string') session = part.sessionID;
    if (part.type !== 'step-finish') continue;
    stepFinishes++;
    if (typeof part.tokens === 'object' && part.tokens !== null) {
      const tokens = part.tokens as { input?: unknown; output?: unknown; cache?: { read?: unknown } | null };
      const inTok = asNumber(tokens.input);
      const outTok = asNumber(tokens.output);
      const cacheTok = asNumber(tokens.cache?.read);
      tokensIn += inTok;
      tokensOut += outTok;
      cacheRead += cacheTok;
      weighted += inTok + 0.1 * cacheTok + 5 * outTok; // формула weighted не изменилась
    }
  }
  return { session, weighted, stepFinishes, tokensIn, tokensOut, cacheRead };
}
