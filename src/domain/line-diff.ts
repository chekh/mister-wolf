// src/domain/line-diff.ts
// T8 (волна 2.20.0, REQ-08, design §4.10): построчный LCS-diff для `--show` и
// `--review`. Без внешних зависимостей, детерминирован: при равной длине LCS
// удаление идёт раньше вставки, хунки — от начала файла. Лимиты — вход
// (maxInput строк на сторону) и вывод (maxOutput строк содержимого, далее
// «… ещё N строк»). EOL нормализуется: `\r` не делает каждую строку изменённой.

export interface DiffLine {
  kind: 'context' | 'del' | 'add';
  text: string;
}

export interface DiffHunk {
  /** 1-based стартовые номера и длины сторон (как в unified diff). */
  aStart: number;
  aLines: number;
  bStart: number;
  bLines: number;
  lines: DiffLine[];
}

export interface LineDiffResult {
  hunks: DiffHunk[];
  /** Число добавленных/удалённых строк (для заголовков `−N +M`). */
  added: number;
  removed: number;
  /** Сколько строк содержимого скрыто лимитом вывода. */
  truncated: number;
  /** Вход был длиннее maxInput и обрезан (лимит §4.10). */
  inputTruncated: boolean;
}

export interface LineDiffLimits {
  maxInput?: number;
  maxOutput?: number;
  /** Строк контекста вокруг изменения (по умолчанию 2). */
  context?: number;
}

const DEFAULT_MAX_INPUT = 4000;
const DEFAULT_MAX_OUTPUT = 200;
const DEFAULT_CONTEXT = 2;
/** Порог DP LCS: при n×m больше — блок считается заменой (детерминированно). */
const DP_CELL_LIMIT = 4_000_000;

const toLines = (source: string): string[] => {
  const normalized = source.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
};

interface Op {
  kind: 'equal' | 'del' | 'add';
  text: string;
}

function middleOps(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((text) => ({ kind: 'add' as const, text }));
  if (m === 0) return a.map((text) => ({ kind: 'del' as const, text }));
  if (n * m > DP_CELL_LIMIT) {
    return [...a.map((text) => ({ kind: 'del' as const, text })), ...b.map((text) => ({ kind: 'add' as const, text }))];
  }
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        a[i] === b[j] ? dp[(i + 1) * width + j + 1]! + 1 : Math.max(dp[(i + 1) * width + j]!, dp[i * width + j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'equal', text: a[i]! });
      i++;
      j++;
    } else if (dp[(i + 1) * width + j]! >= dp[i * width + j + 1]!) {
      ops.push({ kind: 'del', text: a[i]! });
      i++;
    } else {
      ops.push({ kind: 'add', text: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ kind: 'del', text: a[i++]! });
  while (j < m) ops.push({ kind: 'add', text: b[j++]! });
  return ops;
}

/** Полный список операций: общий префикс/суффикс не входят в DP. */
function diffOps(a: string[], b: string[]): Op[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ops: Op[] = a.slice(0, start).map((text) => ({ kind: 'equal' as const, text }));
  ops.push(...middleOps(a.slice(start, endA), b.slice(start, endB)));
  for (let i = endA; i < a.length; i++) ops.push({ kind: 'equal', text: a[i]! });
  return ops;
}

/** Группировка в хунки: изменения ближе 2×context сливаются, иначе — отдельные. */
function toHunks(ops: Op[], context: number): DiffHunk[] {
  // префиксные счётчики сторон: сколько строк a/b прошло до индекса k
  const aBefore = new Uint32Array(ops.length + 1);
  const bBefore = new Uint32Array(ops.length + 1);
  for (let k = 0; k < ops.length; k++) {
    aBefore[k + 1] = aBefore[k]! + (ops[k]!.kind === 'add' ? 0 : 1);
    bBefore[k + 1] = bBefore[k]! + (ops[k]!.kind === 'del' ? 0 : 1);
  }

  const ranges: Array<[number, number]> = [];
  let lastChange = -1;
  for (let i = 0; i < ops.length; i++) {
    if (ops[i]!.kind === 'equal') continue;
    const end = Math.min(ops.length - 1, i + context);
    const last = ranges[ranges.length - 1];
    // равный промежуток ≤ 2×context → тот же хунк (стандартное слияние)
    if (last && lastChange >= 0 && i - lastChange - 1 <= 2 * context) last[1] = Math.max(last[1], end);
    else ranges.push([Math.max(0, i - context), end]);
    lastChange = i;
  }

  return ranges.map(([start, end]) => {
    const lines = ops.slice(start, end + 1).map((op) => ({ kind: op.kind, text: op.text }) as DiffLine);
    return {
      aStart: aBefore[start]! + 1,
      aLines: aBefore[end + 1]! - aBefore[start]!,
      bStart: bBefore[start]! + 1,
      bLines: bBefore[end + 1]! - bBefore[start]!,
      lines,
    };
  });
}

/**
 * Diff двух текстов (a — «было», b — «стало»): хунки с контекстом, счётчики
 * изменений, обрезка вывода по maxOutput (скрытые строки → `truncated`).
 */
export function lineDiff(aText: string, bText: string, limits: LineDiffLimits = {}): LineDiffResult {
  const maxInput = limits.maxInput ?? DEFAULT_MAX_INPUT;
  const maxOutput = limits.maxOutput ?? DEFAULT_MAX_OUTPUT;
  const context = limits.context ?? DEFAULT_CONTEXT;

  if (aText === bText) {
    return { hunks: [], added: 0, removed: 0, truncated: 0, inputTruncated: false };
  }
  let a = toLines(aText);
  let b = toLines(bText);
  const inputTruncated = a.length > maxInput || b.length > maxInput;
  if (a.length > maxInput) a = a.slice(0, maxInput);
  if (b.length > maxInput) b = b.slice(0, maxInput);

  const ops = diffOps(a, b);
  const added = ops.filter((op) => op.kind === 'add').length;
  const removed = ops.filter((op) => op.kind === 'del').length;
  const all = toHunks(ops, context);

  const hunks: DiffHunk[] = [];
  let budget = maxOutput;
  let hidden = 0;
  for (const hunk of all) {
    if (budget <= 0) {
      hidden += hunk.lines.length;
      continue;
    }
    if (hunk.lines.length <= budget) {
      hunks.push(hunk);
      budget -= hunk.lines.length;
      continue;
    }
    hunks.push({ ...hunk, lines: hunk.lines.slice(0, budget), aLines: 0, bLines: 0 });
    hidden += hunk.lines.length - budget;
    budget = 0;
  }
  // длины сторон обрезанного хунка пересчитываются по фактическим строкам
  for (const hunk of hunks) {
    if (hunk.aLines === 0 && hunk.bLines === 0 && hunk.lines.length > 0) {
      hunk.aLines = hunk.lines.filter((l) => l.kind !== 'add').length;
      hunk.bLines = hunk.lines.filter((l) => l.kind !== 'del').length;
    }
  }
  return { hunks, added, removed, truncated: hidden, inputTruncated };
}

/** Текстовое представление diff (unified-подобное): заголовки хунков и строки. */
export function formatDiff(result: LineDiffResult): string[] {
  const out: string[] = [];
  for (const hunk of result.hunks) {
    out.push(`@@ -${hunk.aStart},${hunk.aLines} +${hunk.bStart},${hunk.bLines} @@`);
    for (const line of hunk.lines) {
      out.push(`${line.kind === 'del' ? '-' : line.kind === 'add' ? '+' : ' '}${line.text}`);
    }
  }
  if (result.truncated > 0) {
    const noun = result.truncated === 1 ? 'строка' : result.truncated < 5 ? 'строки' : 'строк';
    out.push(`… ещё ${result.truncated} ${noun}`);
  }
  if (result.inputTruncated) out.push('… input truncated to the line limit');
  return out;
}
