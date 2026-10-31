import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { OpencodeBaseSetRenderer } from '../../../src/adapters/render/opencode/opencode-renderer.js';
import { templatesRoot, harnessTemplatesRoot } from '../../../src/adapters/render/templates-root.js';
import { stripStampLines } from '../../../src/adapters/render/stamp.js';

// Корень репозитория: тест лежит в tests/unit/skills/
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const SKILL_NAME = 'wolf-git';
const POLICY_FILE = 'git-collaboration-policy-v1.1.md';
// Канон: bytes/sha256 закреплены (ADR-1); поставляемая копия обязана совпадать байт-в-байт
const CANON_SHA256 = 'df7d3d826349c4758c338044d1bd9577446f8ff563182e9a2e8a283e5056c208';

const canonPath = join(repoRoot, 'docs/reference', POLICY_FILE);
const skillDir = join(repoRoot, 'templates/base/skills', SKILL_NAME);
const skillPath = join(skillDir, 'SKILL.md');
const shippedPolicyPath = join(skillDir, 'reference', POLICY_FILE);

const sha256 = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex');

const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

describe('wolf-git: канон регламента и поставляемая копия (REQ-03, NFR-02)', () => {
  it('sha256 канона закреплён (ADR-1)', () => {
    expect(sha256(readFileSync(canonPath))).toBe(CANON_SHA256);
  });

  it('поставляемая копия байт-идентична канону', () => {
    const shipped = readFileSync(shippedPolicyPath);
    const canon = readFileSync(canonPath);
    // Байтовое равенство — прямое; sha256 отдельно, чтобы отчёт падения был внятным
    expect(sha256(shipped)).toBe(CANON_SHA256);
    expect(shipped.equals(canon)).toBe(true);
    expect(shipped.toString('utf-8')).toBe(canon.toString('utf-8'));
  });
});

describe('wolf-git: frontmatter и размер скилла (NFR-01)', () => {
  const content = readFileSync(skillPath, 'utf-8');

  it('frontmatter открыт и закрыт, name = имя каталога, description непустой', () => {
    expect(content.startsWith('---\n')).toBe(true);
    const fm = content.match(/^---\n([\s\S]*?)\n---\n/);
    expect(fm, 'frontmatter-шапка должна быть закрыта вторым ---').not.toBeNull();
    const header = fm![1];
    const name = header.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    expect(name).toBe(SKILL_NAME);
    expect(name).toBe(dirname(skillPath).split('/').pop());
    const description = header.match(/^description:\s*(.+)$/m)?.[1]?.trim();
    expect(description && description.length > 0).toBeTruthy();
  });

  it('размер: ≤ 150 строк и ≤ 8000 байт (NFR-01)', () => {
    const bytes = statSync(skillPath).size;
    const lines = content.split('\n').length;
    expect(lines).toBeLessThanOrEqual(150);
    expect(bytes).toBeLessThanOrEqual(8000);
  });
});

describe('wolf-git: адресность и контракт пути (REQ-05, REQ-03)', () => {
  const content = readFileSync(skillPath, 'utf-8');

  it('присутствуют заголовки всех 10 разделов контракта (REQ-05)', () => {
    const headers = [
      'Обязательный вход',
      'Вход / возобновление (G0)',
      'Создание ветки и worktree (G1)',
      'Сохранение (checkpoint)',
      'Передача (G2)',
      'Завершение и уборка (G9)',
      'Приёмка, интеграция и выпуск',
      'Что не поставлено',
      'Гейт перехода',
      'Не пропускай процесс',
    ];
    for (const header of headers) {
      expect(content, `нет раздела «${header}»`).toContain(header);
    }
  });

  it('раздел «Что не поставлено» перечисляет непоставленное по ключевым словам', () => {
    const start = content.indexOf('## Что не поставлено');
    expect(start).toBeGreaterThanOrEqual(0);
    const next = content.indexOf('\n## ', start + 1);
    const section = next === -1 ? content.slice(start) : content.slice(start, next);
    for (const keyword of ['MR', 'CI', 'очеред', 'scheduler', 'inspect']) {
      expect(section.toLowerCase()).toContain(keyword.toLowerCase());
    }
  });

  it('ссылка на регламент: относительный путь существует, установленный путь указан (REQ-03)', () => {
    const rel = `reference/${POLICY_FILE}`;
    expect(content).toContain(rel);
    expect(existsSync(join(skillDir, rel))).toBe(true);
    expect(statSync(join(skillDir, rel)).isFile()).toBe(true);
    expect(content).toContain(`.opencode/skills/${SKILL_NAME}/reference/${POLICY_FILE}`);
  });
});

describe('wolf-git: рендер base-set в tmp (REQ-03, NFR-02)', () => {
  it('в установленном проекте появляются SKILL.md и reference-копия, равная канону', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wolf-git-render-'));
    tmpDirs.push(tmpDir);
    const renderer = new OpencodeBaseSetRenderer(templatesRoot(), {
      harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
    });
    await renderer.renderBaseSet(tmpDir);

    const renderedSkill = join(tmpDir, '.opencode/skills', SKILL_NAME, 'SKILL.md');
    const renderedPolicy = join(tmpDir, '.opencode/skills', SKILL_NAME, 'reference', POLICY_FILE);
    expect(existsSync(renderedSkill), 'нет .opencode/skills/wolf-git/SKILL.md').toBe(true);
    expect(existsSync(renderedPolicy), 'нет reference-копии регламента').toBe(true);

    // Штамп снимается единственным экспортом (§4.4), свой регекс не пишем
    const rendered = stripStampLines(readFileSync(renderedPolicy, 'utf-8'));
    expect(rendered).toBe(readFileSync(canonPath, 'utf-8'));
  });
});

describe('wolf-git: функция сравнения различает расхождение (негативный контроль NFR-02)', () => {
  it('две копии, отличающиеся одним байтом, дают разные sha256 и не равны', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wolf-git-neg-'));
    tmpDirs.push(tmpDir);
    const a = join(tmpDir, 'a.md');
    const b = join(tmpDir, 'b.md');
    writeFileSync(a, 'policy: allow\n');
    writeFileSync(b, 'policy: deny!\n');
    const bytesA = readFileSync(a);
    const bytesB = readFileSync(b);
    expect(bytesA.equals(bytesB)).toBe(false);
    expect(sha256(bytesA)).not.toBe(sha256(bytesB));
  });
});
