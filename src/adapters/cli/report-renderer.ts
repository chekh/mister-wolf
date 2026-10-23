/**
 * REQ-15 / ADR-6 (волна 2.19.0): единый renderer терминального отчёта.
 *
 * Чистая функция над деревом ReportNode: без I/O и без чтения process.env —
 * решение «TTY/пайп/NO_COLOR» принимает caller (прецедент: colorsEnabled в
 * src/domain/facet-colors.ts) и передаёт его как TermEnv. Данные (статусы,
 * счётчики) формируют оркестраторы; renderer про реестр и карту не знает.
 *
 * Дизайн-вопрос №5 решён переносом, не усечением: путь/текст не теряются,
 * рамки не рвутся (snapshot-тесты на width 60/80/120).
 */

export type Marker = 'info' | 'ok' | 'warn' | 'error' | 'skip';
export type ColorDepth = 'truecolor' | '256' | '16' | 'mono';

/** Терминальное окружение; в тестах — фейка, детект — зона caller'а. */
export interface TermEnv {
  tty: boolean;
  colors: ColorDepth;
  width: number;
}

export interface Counter {
  label: string;
  count: number;
}

export type ReportNode =
  | { kind: 'banner'; version: string }
  | { kind: 'section'; title: string; children: ReportNode[] }
  | { kind: 'line'; marker: Marker; text: string; dim?: boolean }
  | { kind: 'summary'; counters: Counter[]; done: boolean };

type LineNode = Extract<ReportNode, { kind: 'line' }>;
type SummaryNode = Extract<ReportNode, { kind: 'summary' }>;
type SectionNode = Extract<ReportNode, { kind: 'section' }>;

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const ANSI = /\x1b\[[0-9;]*m/g;

/** Маркер → глиф + plain-префикс (design §«Палитра»). */
const MARKERS: Readonly<Record<Marker, { glyph: string; plain: string }>> = {
  info: { glyph: '●', plain: '-' },
  ok: { glyph: '●', plain: 'ok:' },
  warn: { glyph: '▲', plain: 'warn:' },
  error: { glyph: '✖', plain: 'error:' },
  skip: { glyph: '●', plain: 'skip:' },
};

/** ANSI-код маркера по глубине палитры; okDim — «dim green» для ok+dim (up-to-date/unchanged). */
type Palette = Readonly<Record<Marker | 'okDim', string>>;

const PALETTES: Readonly<Record<ColorDepth, Palette>> = {
  truecolor: {
    info: '\x1b[38;2;0;191;191m', // cyan
    ok: '\x1b[38;2;80;220;100m', // green
    okDim: '\x1b[38;2;110;170;120m', // dim green
    warn: '\x1b[38;2;230;190;60m', // yellow
    error: '\x1b[38;2;235;90;90m', // red
    skip: DIM,
  },
  '256': {
    info: '\x1b[38;5;80m',
    ok: '\x1b[38;5;71m',
    okDim: '\x1b[38;5;108m',
    warn: '\x1b[38;5;179m',
    error: '\x1b[38;5;173m',
    skip: DIM,
  },
  '16': {
    // okDim сливается с ok (нет dim-green в 16 цветах): различимость несут маркер + слово (REQ-15 AC-3)
    info: '\x1b[36m',
    ok: '\x1b[32m',
    okDim: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    skip: '\x1b[90m',
  },
  mono: { info: '', ok: '', okDim: '', warn: '', error: '', skip: '' },
};

/** Логотип A — блочный вордмарк Mr.WOLF (уточнение владельца mem_20261023_utochnenie_logotipa_2_19_0_blochnyy_vord_a989dd); глифы скопированы дословно. */
const LOGO: readonly string[] = [
  'Mr.  ██╗    ██╗███████╗ ██████╗ ███████╗',
  '     ██║    ██║██╔════╝██╔═══██╗╚══███╔╝',
  '     ██║ █╗ ██║█████╗  ██║   ██║  ███╔╝',
  '     ██║███╗██║██╔══╝  ██║   ██║ ███╔╝',
  '     ╚███╔███╔╝███████╗╚██████╔╝███████╗',
  '      ╚══╝╚══╝ ╚══════╝ ╚═════╝ ╚══════╝',
  '                   upgrade ${v}',
];

const paint = (code: string, s: string): string => (code ? `${code}${s}${RESET}` : s);
const visibleLen = (s: string): number => s.replace(ANSI, '').length;

/** Отчёт → строка: styled при tty=true, plain (плоские строки с префиксами) при tty=false. */
export function renderReport(node: ReportNode, env: TermEnv): string {
  return (env.tty ? styledTop(node, env) : plainTop(node)).join('\n');
}

function plainTop(node: ReportNode): string[] {
  switch (node.kind) {
    case 'banner':
      return [`Mr Wolf upgrade ${node.version}`];
    case 'section':
      return [node.title, ...node.children.flatMap(plainTop)];
    case 'line':
      return [`${MARKERS[node.marker].plain} ${node.text}`];
    case 'summary':
      return [summaryText(node)];
  }
}

function summaryText(n: SummaryNode): string {
  const counters = n.counters.map((c) => `${c.label} ${c.count}`).join(' · ');
  return n.done ? `${counters} — Done` : counters;
}

function styledTop(node: ReportNode, env: TermEnv): string[] {
  switch (node.kind) {
    case 'banner':
      return bannerLines(env, node.version);
    case 'section':
      return sectionFrame(node, env);
    case 'line':
      return lineLines(node, env, '', Math.max(1, env.width - 3));
    case 'summary':
      return [`└ ${summaryText(node)}`];
  }
}

function bannerLines(env: TermEnv, version: string): string[] {
  const tpl = LOGO.map((l) => l.replace('${v}', version));
  const widest = Math.max(...tpl.map(visibleLen));
  // Деградация ширины: логотип не лезет — однострочный текстовый баннер (как plain)
  if (widest > env.width) return [`Mr Wolf upgrade ${version}`];
  return tpl.map((l) => paint(PALETTES[env.colors].info, l));
}

function sectionFrame(sec: SectionNode, env: TermEnv): string[] {
  const maxInner = Math.max(1, env.width - 4);
  const children = [...sec.children];
  const last = children[children.length - 1];
  const closing = last?.kind === 'summary' ? (children.pop() as SummaryNode) : null;

  const titleParts = wrap(sec.title, maxInner);
  const content = children.flatMap((c) => contentLines(c, env, '', maxInner));
  const closingParts = closing ? wrap(summaryText(closing), maxInner) : null;

  // Автоширина рамки: по самому длинному содержимому, но не шире терминала
  let inner = Math.max(
    titleParts.reduce((m, t) => Math.max(m, t.length), 0),
    ...content.map(visibleLen),
    0
  );
  if (closingParts) inner = Math.max(inner, ...closingParts.map((t) => t.length));
  inner = Math.min(inner, maxInner);

  const out: string[] = [];
  titleParts.forEach((t, i) => out.push(`${i === 0 ? '┌' : '│'} ${(t + ' ').padEnd(inner, '─')}┐`));
  for (const l of content) {
    out.push(`│ ${l}${' '.repeat(Math.max(0, inner - visibleLen(l)))} │`);
  }
  if (closingParts) {
    closingParts.forEach((t, i) => {
      const tail = i === closingParts.length - 1;
      out.push(`${tail ? '└' : '│'} ${(t + ' ').padEnd(inner, '─')}${tail ? '┘' : '┤'}`);
    });
  } else {
    out.push(`└${'─'.repeat(inner + 2)}┘`);
  }
  return out;
}

/** Содержимое секции без рамки; вложенные секции — заголовок + дети с отступом (вайрфрейм design (1)). */
function contentLines(node: ReportNode, env: TermEnv, indent: string, maxInner: number): string[] {
  switch (node.kind) {
    case 'banner':
      return bannerLines(env, node.version); // глифы логотипа не переносим
    case 'section':
      return [
        ...wrap(node.title, Math.max(1, maxInner - indent.length)).map((t) => indent + t),
        ...node.children.flatMap((c) => contentLines(c, env, indent + '  ', maxInner)),
      ];
    case 'line':
      // 3 = глиф + пробел + колонка выравнивания продолжения (перенос длиннее первой строки на 1)
      return lineLines(node, env, indent, Math.max(1, maxInner - indent.length - 3));
    case 'summary':
      return wrap(summaryText(node), Math.max(1, maxInner - indent.length - 2)).map(
        (t, i) => indent + (i === 0 ? '' : '  ') + t
      );
  }
}

function lineLines(node: LineNode, env: TermEnv, indent: string, budget: number): string[] {
  const p = PALETTES[env.colors];
  const code = node.marker === 'ok' && node.dim ? p.okDim : p[node.marker];
  const glyph = paint(code, MARKERS[node.marker].glyph);
  const dim = (s: string): string => (node.dim && env.colors !== 'mono' ? paint(DIM, s) : s);
  // Перенос: продолжение выравнивается под текст (отступ маркера), текст не усекается
  return wrap(node.text, budget).map((part, i) => `${indent}${i === 0 ? glyph : '  '} ${dim(part)}`);
}

/** Word-wrap; неразрывные токены (пути) режутся жёстко. */
function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    if (word === '') continue;
    const cand = cur === '' ? word : `${cur} ${word}`;
    if (cand.length <= max) {
      cur = cand;
      continue;
    }
    if (cur !== '') {
      out.push(cur);
      cur = '';
    }
    let rest = word;
    while (rest.length > max) {
      out.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    cur = rest;
  }
  if (cur !== '' || out.length === 0) out.push(cur);
  return out;
}
