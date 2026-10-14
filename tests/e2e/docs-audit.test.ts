// A10 (REQ-02, 2.18.0): аудит публичных документов — удалённые команды
// (learn-контур, Sandbox Replay, STOP-гейт) не должны всплывать в публичных
// файлах как действующие инструкции. Исторические спеки/планы помечены
// `historical: true` и допущены как архив (S-12/S-13).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..', '..');

const FORBIDDEN_TOKENS = [
  'wolf learn',
  'sandbox-replay',
  'Sandbox Replay',
  'STOP-гейт',
  'STOP gate',
  'learn --from-session',
] as const;

// Архив: документы, описывающие удалённый learn-контур. Допущены при
// frontmark `historical: true` (S-12/S-13). steward-learn.md — протокол
// целиком удалённого контура (T-A10 бриф).
const ALLOWED_FILES_WITH_HISTORICAL = new Set<string>([
  'docs/superpowers/specs/2026-08-26-self-learning-design.md',
  'docs/superpowers/plans/roadmap-v2.md',
  'docs/superpowers/plans/2026-10-02-product-roadmap-2.15-plus.md',
  'docs/superpowers/plans/2026-10-10-wave-2.16-init2-unpin-hygiene-plan.md',
  'docs/guide/steward-learn.md',
]);

// Документы текущей фазы — аудит их не касается (T-INT ведёт отдельно).
const EXCLUDED_DIRS = ['docs/dev/2026-10-14-phase-a-dobor'];

function scanText(text: string): string[] {
  return FORBIDDEN_TOKENS.filter((t) => text.includes(t));
}

function hasHistoricalFlag(text: string): boolean {
  const head = text.split('\n').slice(0, 50).join('\n');
  return /^historical:\s*true\s*$/m.test(head);
}

function walkMarkdown(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full).split(sep).join('/');
    if (statSync(full).isDirectory()) {
      if (EXCLUDED_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) continue;
      walkMarkdown(full, acc);
    } else if (entry.endsWith('.md')) {
      acc.push(rel);
    }
  }
  return acc;
}

function auditFile(rel: string): { hits: string[]; historical: boolean } {
  const text = readFileSync(join(ROOT, rel), 'utf-8');
  return { hits: scanText(text), historical: hasHistoricalFlag(text) };
}

describe('A10 docs audit (REQ-02)', () => {
  it('S-10: docs/**/*.md (кроме документов текущей фазы) не содержат токенов удалённых команд; исторические — с флагом historical: true', () => {
    const offenders: string[] = [];
    for (const rel of walkMarkdown(join(ROOT, 'docs'))) {
      const { hits, historical } = auditFile(rel);
      if (ALLOWED_FILES_WITH_HISTORICAL.has(rel)) {
        if (!historical) offenders.push(`${rel}: нет historical: true (архивный допуск)`);
        continue;
      }
      if (hits.length > 0) offenders.push(`${rel}: ${hits.join(', ')}`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('S-11: спека self-learning-design помечена historical: true', () => {
    const text = readFileSync(join(ROOT, 'docs/superpowers/specs/2026-08-26-self-learning-design.md'), 'utf-8');
    expect(hasHistoricalFlag(text)).toBe(true);
  });

  it('S-12: README.md и README.ru.md чисты от токенов', () => {
    for (const rel of ['README.md', 'README.ru.md']) {
      expect(scanText(readFileSync(join(ROOT, rel), 'utf-8')), rel).toEqual([]);
    }
  });

  it('S-13: docs/concept/concept.md чист от токенов', () => {
    expect(scanText(readFileSync(join(ROOT, 'docs/concept/concept.md'), 'utf-8'))).toEqual([]);
  });

  it('S-14: счётчик «8 core» присутствует, устаревший «25 типов» отсутствует', () => {
    for (const rel of ['README.md', 'docs/concept/concept.md', 'docs/README.md']) {
      const text = readFileSync(join(ROOT, rel), 'utf-8');
      expect(text, `${rel}: нет счётчика 8 core`).toMatch(/8\s*core/i);
      expect(text.match(/\b25\s*\+?\s*(типов|типы|types)\b/i), `${rel}: жив счётчик 25 типов`).toBeNull();
    }
  });

  it('S-15: HomeModes.vue сайта чист от токенов', () => {
    const rel = 'docs/site/.vitepress/theme/components/HomeModes.vue';
    expect(scanText(readFileSync(join(ROOT, rel), 'utf-8'))).toEqual([]);
  });

  it('S-61: сканер чувствителен — вносит токен в образец текста и ловит его', () => {
    expect(scanText('текст с `wolf learn digest` внутри')).toContain('wolf learn');
    expect(scanText('исторический протокол Sandbox Replay')).toContain('Sandbox Replay');
    expect(scanText('чистый текст про add --type lesson')).toEqual([]);
  });
});
