import { describe, expect, it } from 'vitest';
import { renderReport, type ReportNode, type TermEnv } from '../../../src/adapters/cli/report-renderer.js';

/** R15.1/R15.2/R15.3 (test-plan): TermEnv-фейки, TTY не эмулируем. */
const truecolor: TermEnv = { tty: true, colors: 'truecolor', width: 80 };
const plainEnv: TermEnv = { tty: false, colors: 'truecolor', width: 80 };

/** Вайрфрейм design (1) EN-текстами: парковой проход wolf upgrade. */
const parkTree: ReportNode = {
  kind: 'section',
  title: 'Mr Wolf — upgrade 2.19.0',
  children: [
    { kind: 'line', marker: 'info', text: 'wolf 2.18.5 → 2.19.0 … ok' },
    { kind: 'line', marker: 'info', text: '4 projects in registry (1 pinned, 1 worktree)' },
    {
      kind: 'section',
      title: 'plan: trading-signal · ~/dev/trading-signal',
      children: [
        { kind: 'line', marker: 'info', text: 'composition 2.17.1 (stamp 2.16.2) → 2.19.0' },
        { kind: 'line', marker: 'info', text: 'map: +2 skills · 1 changed · 0 removed · seed×2' },
      ],
    },
    {
      kind: 'section',
      title: 'plan: Tender · ~/dev/Tender',
      children: [{ kind: 'line', marker: 'info', text: 'composition 2.16.0, no faces → 2.19.0 · map: seed×6' }],
    },
    { kind: 'line', marker: 'skip', text: 'plan: adminvps · [pinned] — skipped' },
    {
      kind: 'section',
      title: 'trading-signal',
      children: [
        { kind: 'line', marker: 'ok', text: 'base-set: 30 files → updated' },
        { kind: 'line', marker: 'info', text: 'faces: executor-lead seeded, worker-* skip-live' },
        { kind: 'line', marker: 'ok', text: 'map check: 33/33 ok' },
      ],
    },
    {
      kind: 'section',
      title: 'Tender',
      children: [
        { kind: 'line', marker: 'ok', text: 'base-set: 29 updated' },
        { kind: 'line', marker: 'warn', text: '1 skipped-mutated' },
        { kind: 'line', marker: 'warn', text: 'map check: 1 needs-decision' },
      ],
    },
    {
      kind: 'summary',
      done: true,
      counters: [
        { label: 'updated', count: 2 },
        { label: 'needs-decision', count: 1 },
        { label: 'errors', count: 0 },
        { label: 'faces seeded', count: 8 },
      ],
    },
  ],
};

/** Все строки таблицы статусов (design §«Палитра»): маркер выбирает caller, слово несёт статус. */
const statusTree: ReportNode = {
  kind: 'section',
  title: 'statuses',
  children: [
    { kind: 'line', marker: 'info', text: 'phase step info' },
    { kind: 'line', marker: 'ok', text: 'base-set updated' },
    { kind: 'line', marker: 'ok', text: 'faces created, seeded, removed' },
    { kind: 'line', marker: 'ok', dim: true, text: 'already up-to-date, unchanged' },
    { kind: 'line', marker: 'ok', text: 'schema migrated, legacy-absorbed' },
    { kind: 'line', marker: 'warn', text: 'needs-decision: deprecated file' },
    { kind: 'line', marker: 'warn', text: 'migration refused' },
    { kind: 'line', marker: 'warn', text: 'project local-newer than CLI' },
    { kind: 'line', marker: 'error', text: 'linked-refusal (npm phase)' },
    { kind: 'line', marker: 'skip', text: 'pinned / worktree / missing skipped' },
    { kind: 'line', marker: 'skip', text: 'faces skipped-live' },
  ],
};

const summaryNode: ReportNode = {
  kind: 'summary',
  done: true,
  counters: [
    { label: 'updated', count: 2 },
    { label: 'needs-decision', count: 1 },
    { label: 'errors', count: 0 },
  ],
};

const visible = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');
const visibleLines = (s: string): string[] => s.split('\n').map(visible);

/** REQ-15 AC-3: в любом режиме статус различим маркером + словом. */
function expectMarkerWord(out: string, glyph: string, word: string): void {
  const hit = out.split('\n').some((l) => l.includes(glyph) && l.includes(word));
  expect(hit, `${glyph} + "${word}" should stay on one line`).toBe(true);
}

describe('renderReport', () => {
  it('R15.1 styled truecolor: логотип A, рамки секций, маркеры, └ Done', () => {
    const out = [
      renderReport({ kind: 'banner', version: '2.19.0' }, truecolor),
      renderReport(parkTree, truecolor),
    ].join('\n');
    expect(out).toContain('██╗'); // логотип A (Mr.WOLF)
    expect(out).toContain('Mr.  ██╗');
    expect(out).not.toContain('╔═╗'); // демо-блок design-эскиза удалён
    expect(visible(renderReport({ kind: 'banner', version: '2.19.0' }, truecolor))).toMatchSnapshot();
    expect(out).toContain('upgrade 2.19.0');
    expect(out).toContain('┌ Mr Wolf — upgrade 2.19.0 ');
    const visibleOut = visibleLines(out);
    expect(visibleOut.some((l) => l.includes('│ ● wolf 2.18.5 → 2.19.0 … ok'))).toBe(true);
    expect(visibleOut.some((l) => l.includes('▲ 1 skipped-mutated'))).toBe(true);
    expect(out).toContain('\x1b[38;2;'); // truecolor присутствует
    const lines = visibleOut;
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(truecolor.width);
    expect(lines[lines.length - 1]).toMatch(/└ updated 2 · needs-decision 1 · errors 0 · faces seeded 8 — Done/);
  });

  it('R15.2 plain: banner — однострочный фоллбек', () => {
    const out = renderReport({ kind: 'banner', version: '2.19.0' }, plainEnv);
    expect(out).toBe('Mr Wolf upgrade 2.19.0');
    expect(out).toMatchSnapshot();
  });

  it('R15.2 plain: те же данные/порядок, без рамок и ANSI (snapshot — оракул)', () => {
    const out = renderReport(parkTree, plainEnv);
    expect(out).not.toContain('\x1b');
    expect(out).not.toContain('┌');
    expect(out).toContain('- wolf 2.18.5 → 2.19.0 … ok');
    expect(out).toContain('ok: base-set: 30 files → updated');
    expect(out).toContain('warn: 1 skipped-mutated');
    expect(out).toContain('skip: plan: adminvps · [pinned] — skipped');
    expect(out).toContain('updated 2 · needs-decision 1 · errors 0 · faces seeded 8 — Done');
    expect(out).toMatchSnapshot();
  });

  it('R15.2 plain: summary-поверхность (snapshot)', () => {
    const out = renderReport(summaryNode, plainEnv);
    expect(out).toBe('updated 2 · needs-decision 1 · errors 0 — Done');
    expect(out).toMatchSnapshot();
  });

  it('R15.2 plain: не зависит от ширины (60/80/120 идентичны)', () => {
    const outs = [60, 80, 120].map((width) => renderReport(parkTree, { ...plainEnv, width }));
    expect(outs[0]).toBe(outs[1]);
    expect(outs[1]).toBe(outs[2]);
  });

  it('R15.3 256: деградация без 24-бит кодов, статусы различимы', () => {
    const env: TermEnv = { tty: true, colors: '256', width: 80 };
    const out = renderReport(statusTree, env);
    expect(out).not.toContain('\x1b[38;2;');
    expect(out).toContain('\x1b[38;5;');
    expectMarkerWord(out, '●', 'updated');
    expectMarkerWord(out, '▲', 'needs-decision');
    expectMarkerWord(out, '✖', 'linked-refusal');
    expectMarkerWord(out, '●', 'pinned');
  });

  it('R15.3 16: только базовые коды, статусы различимы', () => {
    const env: TermEnv = { tty: true, colors: '16', width: 80 };
    const out = renderReport(statusTree, env);
    expect(out).not.toContain('\x1b[38;2;');
    expect(out).not.toContain('\x1b[38;5;');
    expectMarkerWord(out, '●', 'updated');
    expectMarkerWord(out, '▲', 'refused');
    expectMarkerWord(out, '✖', 'linked-refusal');
    expectMarkerWord(out, '●', 'skipped-live');
  });

  it('R15.3 mono styled: без ANSI вовсе, маркер + слово сохраняют различимость', () => {
    const env: TermEnv = { tty: true, colors: 'mono', width: 80 };
    const out = renderReport(statusTree, env);
    expect(out).not.toContain('\x1b');
    expect(out).toContain('┌'); // рамки остаются, цвет — нет
    expectMarkerWord(out, '●', 'phase step info');
    expectMarkerWord(out, '●', 'up-to-date');
    expectMarkerWord(out, '▲', 'deprecated');
    expectMarkerWord(out, '✖', 'linked-refusal');
    expectMarkerWord(out, '●', 'skipped-live');
  });

  it.each([60, 80, 120])('width %i: styled с длинным путём — перенос, рамки не рвутся', (width) => {
    const longTree: ReportNode = {
      kind: 'section',
      title: 'Mr Wolf — upgrade 2.19.0',
      children: [
        {
          kind: 'section',
          title: `plan: trading-signal · ${'~/very/long/'.repeat(6)}trading-signal`,
          children: [
            { kind: 'line', marker: 'info', text: `composition 2.17.1 → 2.19.0 · map: +2 skills · ${'x'.repeat(90)}` },
            { kind: 'line', marker: 'warn', text: '1 skipped-mutated' },
          ],
        },
        summaryNode,
      ],
    };
    const env: TermEnv = { tty: true, colors: 'truecolor', width };
    const out = renderReport(longTree, env);
    const lines = visibleLines(out);
    for (const l of lines) expect(l.length, JSON.stringify(l)).toBeLessThanOrEqual(width);
    expect(out).toMatchSnapshot();
  });

  it('AC-5 чистота: детерминирована, без I/O — одинаковый вход даёт одинаковый выход', () => {
    expect(renderReport(parkTree, plainEnv)).toBe(renderReport(parkTree, { ...plainEnv }));
  });
});
