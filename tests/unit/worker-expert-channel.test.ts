import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

// 2.32.2 REQ-01/REQ-02 (диагностика mem_20261106_council-packet-only-diagnosis-20261106_1c939d):
// профиль worker-expert по умолчанию должен давать рабочий read-канал в границах
// проекта (файлы + discover glob/grep), сохраняя deny на запись/shell/субагентов/
// сеть/внешние каталоги и ask-защиту env-файлов ПОСЛЕ широкого read-allow
// (резолвер OpenCode — last-match-wins, поэтому порядок правил и есть защита).
const base = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base');
const agentRaw = readFileSync(join(base, 'agents', 'worker-expert.md'), 'utf-8');
const councilSkill = readFileSync(join(base, 'skills', 'wolf-council', 'SKILL.md'), 'utf-8');
const contracts = readFileSync(join(base, 'skills', 'using-skills', 'references', 'contracts.md'), 'utf-8');

interface Rule {
  action: string;
  resource: string;
  effect: 'allow' | 'deny' | 'ask';
}

function frontmatter(raw: string): Record<string, unknown> {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error('worker-expert.md: frontmatter block missing');
  return yaml.load(m[1]!) as Record<string, unknown>;
}

const rules = frontmatter(agentRaw)['permissions'] as Rule[];

/** Семантика OpenCode: wildcard `*`/`?`, последнее совпадение выигрывает. */
function matches(pattern: string, value: string): boolean {
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$'
  );
  return re.test(value);
}

function effective(action: string, resource: string): string {
  let effect = 'ask'; // нет совпадения → ask (дефолт платформы)
  for (const r of rules) {
    if (matches(r.action, action) && matches(r.resource, resource)) effect = r.effect;
  }
  return effect;
}

describe('worker-expert profile: read-канал в границах проекта (2.32.2 REQ-01)', () => {
  it('профиль объявлен v2-массивом permissions (не смешанный frontmatter)', () => {
    const front = frontmatter(agentRaw);
    expect(Array.isArray(front['permissions'])).toBe(true);
    expect(front['permission']).toBeUndefined();
  });

  it('чтение файлов проекта разрешено — включая код', () => {
    expect(effective('read', 'src/app/use-cases/record-council.ts')).toBe('allow');
    expect(effective('read', 'templates/base/agents/worker-expert.md')).toBe('allow');
    expect(effective('read', 'docs/site/guide/council.md')).toBe('allow');
  });

  it('discover-инструменты работают: glob/grep иначе эксперт не найдёт файл', () => {
    expect(effective('glob', '*')).toBe('allow');
    expect(effective('grep', '*')).toBe('allow');
  });

  it('мёртвое правило read packet/* больше не единственная выдача', () => {
    expect(rules.some((r) => r.action === 'read' && r.resource === 'packet/*')).toBe(false);
  });

  it('запись, shell, субагенты, сеть и браузер остаются запрещены', () => {
    expect(effective('edit', 'src/x.ts')).toBe('deny');
    expect(effective('shell', '*')).toBe('deny');
    expect(effective('subagent', '*')).toBe('deny');
    expect(effective('webfetch', 'https://example.com')).toBe('deny');
    expect(effective('websearch', 'query')).toBe('deny');
    expect(effective('browser', '*')).toBe('deny');
    expect(effective('skill', 'wolf-council')).toBe('deny');
  });

  it('чтение вне проекта остаётся запрещено (external_directory)', () => {
    expect(effective('external_directory', '*')).toBe('deny');
  });

  it('env-файлы остаются под ask/allow-защитой ПОСЛЕ широкого read-allow', () => {
    // порядок и есть защита: last-match-wins, поэтому env-правила обязаны идти позже
    const broadReadAt = rules.findIndex((r) => r.action === 'read' && r.resource === '*');
    const envAt = rules.findIndex((r) => r.action === 'read' && r.resource === '*.env');
    const envDotAt = rules.findIndex((r) => r.action === 'read' && r.resource === '*.env.*');
    expect(broadReadAt).toBeGreaterThanOrEqual(0);
    expect(envAt).toBeGreaterThan(broadReadAt);
    expect(envDotAt).toBeGreaterThan(broadReadAt);

    expect(effective('read', '.env')).toBe('ask');
    expect(effective('read', '.env.local')).toBe('ask');
    expect(effective('read', 'config/.env')).toBe('ask');
    expect(effective('read', 'sub.env')).toBe('ask');
    // пример-файл остаётся читаемым — как в глобальном дефолте OpenCode
    expect(effective('read', '.env.example')).toBe('allow');
  });

  it('рамка профиля описывает фактический канал, а не мёртвое packet-only по умолчанию', () => {
    expect(agentRaw).toContain('channel');
    expect(agentRaw).toContain('isolation_limits');
    expect(agentRaw).toContain('перечень путей');
  });
});

describe('wolf-council: обязательная функциональная проба канала (2.32.2 REQ-02)', () => {
  it('проба канала отдельная от symlink-аудита и обе обязательны', () => {
    expect(councilSkill).toContain('Аудит Location на symlink');
    expect(councilSkill).toContain('Функциональная проба канала');
    expect(councilSkill).toContain('одна другую не заменяет');
  });

  it('успех пробы определён фактом содержимого, а не фактом tool-вызова', () => {
    expect(councilSkill).toContain('факт содержимого');
    expect(councilSkill).toContain('permission.rejected');
    expect(councilSkill).toContain('NEEDS_CONTEXT');
  });

  it('явно сказано: перечень путей в TASK не является выдачей прав', () => {
    expect(councilSkill).toContain('перечень путей в TASK выдачей прав не является');
  });

  it('isolation_limits обязателен, если канал не tool-enabled', () => {
    expect(councilSkill).toContain('isolation_limits');
    expect(councilSkill).toMatch(/isolation_limits`?\s+обязателен/);
  });
});

describe('profiles expert/synthesis: признак channel (2.32.2 REQ-03)', () => {
  it('профиль expert требует назвать фактический channel первой строкой RESULT', () => {
    expect(contracts).toContain('`channel`');
    expect(contracts).toContain('tool-enabled');
    expect(contracts).toContain('packet-only');
    expect(contracts).toContain('denied');
    expect(contracts).toMatch(/isolation_limits`?\s+обязательно/);
  });
});
