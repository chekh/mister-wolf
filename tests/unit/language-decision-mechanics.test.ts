import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * S-24/S-25 (RC 3.2.0, REQ-01): гарды механики языкового решения в
 * доставленном тексте. Носитель поведения — секция «Session language»
 * онбординг-блока AGENTS.md и раздел «Session-language decision mechanics»
 * в agent-language.md: дефекты behavior-check 2026-11-16 были именно в тексте
 * (безусловный `wolf add` после первой реплики порождал дубликат решения в
 * новой сессии; замена языка выполнялась без supersede). Живые сценарии
 * S-24/S-25 (прогоны агента) остаются в кампании T-12 — эти гарды фиксируют
 * поставляемый текст-носитель между релизами.
 */
const AGENTS_TEMPLATE = join(process.cwd(), 'templates', 'base', 'AGENTS.md');
const AGENT_LANGUAGE = join(
  process.cwd(),
  'templates',
  'base',
  'skills',
  'using-skills',
  'references',
  'agent-language.md'
);

function section(file: string, heading: string, stopAt: string): string {
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf(heading);
  expect(start, `${file}: нет заголовка ${heading}`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf(stopAt, start);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

const agentsRule = () => section(AGENTS_TEMPLATE, '## Session language', '<!-- /wolf:onboarding -->');
const agentLanguageRule = () => section(AGENT_LANGUAGE, '## Session-language decision mechanics', '## Terms');

describe('S-24: read-before-create — дубликат решения не создаётся', () => {
  it('AGENTS.md: чтение существующего состояния предшествует wolf add', () => {
    const text = agentsRule();
    const searchIdx = text.indexOf('`wolf search "Session language"`');
    const briefIdx = text.indexOf('`wolf brief`');
    const addIdx = text.indexOf('`wolf add --type decision');
    expect(searchIdx, 'нет команды чтения wolf search').toBeGreaterThanOrEqual(0);
    expect(briefIdx, 'нет упоминания wolf brief').toBeGreaterThanOrEqual(0);
    expect(addIdx, 'нет команды записи wolf add').toBeGreaterThanOrEqual(0);
    expect(Math.max(searchIdx, briefIdx), 'чтение должно идти раньше записи').toBeLessThan(addIdx);
  });

  it('AGENTS.md: активное решение без явного switch — запись не создаётся', () => {
    const text = agentsRule();
    expect(text).toMatch(/If an active language decision already exists, apply it and record nothing/);
    expect(text, 'должен быть прямой запрет дубликата').toMatch(/never creates a duplicate/);
  });

  it('AGENTS.md: безусловный add канонизирован только для случая «активного решения нет»', () => {
    const text = agentsRule();
    const addIdx = text.indexOf('`wolf add --type decision');
    const gateIdx = text.indexOf('If no active decision exists');
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    expect(gateIdx, 'wolf add должен идти после условия «активного решения нет»').toBeLessThan(addIdx);
  });

  it('agent-language.md: та же механика read-before-create с явным отказом от дублей', () => {
    const text = agentLanguageRule();
    const searchIdx = text.indexOf('`wolf search "Session language"`');
    const addIdx = text.indexOf('`wolf add --type decision');
    expect(searchIdx).toBeGreaterThanOrEqual(0);
    expect(searchIdx, 'чтение должно идти раньше записи').toBeLessThan(addIdx);
    expect(text).toMatch(/read before it is\s+created/);
    expect(text).toMatch(/create no record/);
    expect(text).toMatch(/no duplicates/);
  });
});

describe('S-25: явный switch — новое решение + supersede, ровно одно active', () => {
  it('AGENTS.md: замена только по явной инструкции, add + supersede, ровно одно активное', () => {
    const text = agentsRule();
    expect(text).toContain('only on explicit user instruction');
    const addIdx = text.indexOf('`wolf add --type decision');
    const supersedeIdx = text.indexOf('`wolf supersede <old-id> <new-id>`');
    expect(supersedeIdx, 'нет команды замены wolf supersede').toBeGreaterThanOrEqual(0);
    expect(addIdx, 'сначала запись нового решения, потом замена').toBeLessThan(supersedeIdx);
    expect(text).toMatch(/exactly one language\s+decision stays active/);
  });

  it('agent-language.md: то же обязательство замены — ровно одно активное решение', () => {
    const text = agentLanguageRule();
    const addIdx = text.indexOf('`wolf add --type decision');
    const supersedeIdx = text.indexOf('`wolf supersede <old-id> <new-id>`');
    expect(supersedeIdx).toBeGreaterThanOrEqual(0);
    expect(addIdx).toBeLessThan(supersedeIdx);
    expect(text).toMatch(/exactly one language decision stays active/);
  });
});
