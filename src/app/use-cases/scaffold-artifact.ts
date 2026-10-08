import { join } from 'path';
import { Clock } from '../../ports/clock.port.js';
import { FileSystem } from '../../ports/file-system.port.js';
import { UserFacingError } from '../../domain/errors.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export interface ScaffoldArtifactDeps {
  clock: Clock;
  fs: Pick<FileSystem, 'exists' | 'writeFile'>;
  baseDir: string;
}

export interface ScaffoldArtifactInput {
  slug: string;
  fix: boolean;
}

export interface ScaffoldArtifactResult {
  dir: string;
  files: string[];
}

function frontMatter(slug: string, title: string, created: string): string {
  return ['---', `slug: ${slug}`, `title: ${title}`, 'status: draft', `created: ${created}`, '---', ''].join('\n');
}

/** Анатомия §4.1 спеки — дословно (7 секций + анатомия записи REQ/NFR). */
export function requirementsTemplate(slug: string, title: string, created: string, fix: boolean): string {
  if (fix) {
    return [
      frontMatter(slug, title, created),
      `# ${title} — требования и журнал изменений (fix-профиль)`,
      '',
      '## 1. Контекст и проблема',
      '<!-- Что наблюдаем, где, с какой версии; эффект на проект. -->',
      '',
      '## 2. Функциональные требования',
      '<!-- Записи REQ-NN при необходимости; в простом фиксе секция остаётся пустой. -->',
      '',
      '## 3. Журнал изменений (CR) — содержание фикса',
      '<!-- Append-only. Каждая запись: дата, что/почему, кем утверждено, downstream-перегенерации. -->',
      '',
      `- CR-${created}-01: <что и почему> — утвердил <кто>; downstream: <артефакты или «нет»>`,
      '',
    ].join('\n');
  }
  return [
    frontMatter(slug, title, created),
    `# ${title} — функциональные требования`,
    '',
    '## 1. Контекст и проблема',
    '<!-- Зачем, прозой, бизнес-языком; метрика успеха. -->',
    '',
    '## 2. Область',
    '<!-- Что входит; НЕ входит (не-цели уровня требований). -->',
    '',
    '## 3. Глоссарий',
    '<!-- Бизнес-термины фичи, если появились новые. -->',
    '',
    '## 4. Функциональные требования',
    '',
    '### REQ-01 — <Название>',
    '- История: Как <роль>, я хочу <возможность>, чтобы <выгода>.',
    '- Требование: Когда <условие>, система должна <поведение>.',
    '- Обоснование: <зачем это бизнесу — словами владельца>',
    '- AC: <измеримый критерий; нетривиальные — Given/When/Then>',
    '- Приоритет: Must',
    '- Источник: <диалог YYYY-MM-DD / жалоба mem-… / ревью-линза>',
    '',
    '## 5. Нефункциональные требования (NFR)',
    '<!-- Производительность, безопасность, совместимость; каждая с измеримым критерием. -->',
    '',
    '### NFR-01 — <Название>',
    '- Требование: <shall-формулировка ограничения>',
    '- AC: <измеримый критерий>',
    '- Источник: <откуда требование>',
    '',
    '## 6. Ограничения и допущения',
    '<!-- Что считаем данным. -->',
    '',
    '## 7. Журнал изменений (CR)',
    '<!-- Append-only. Каждая запись: дата, затронутый REQ/NFR, что/почему, кем утверждено, какие downstream-артефакты перегенерированы. -->',
    '',
    `- CR-${created}-01: <что и почему> — утвердил <кто>; downstream: <артефакты или «нет»>`,
    '',
  ].join('\n');
}

export function designTemplate(slug: string, title: string, created: string): string {
  return [
    frontMatter(slug, `${title} — дизайн`, created),
    `# ${title} — дизайн`,
    '',
    '## Глоссарий',
    '<!-- Технические термины; термин вводится до использования. -->',
    '',
    '## Компоненты и ответственность',
    '<!-- Каждый компонент: имя — ответственность — файл. -->',
    '',
    '## Контракты',
    '<!-- Типы, схемы, форматы событий; блоки ≤ 10 строк; псевдокод алгоритмов разрешён. Копипаста реализации продукта запрещена. -->',
    '',
    '## ADR-карточки',
    '<!-- ADR-N: Контекст → Решение → Последствия. ADR — продуктовые выборы: владелец визирует отдельно. -->',
    '',
    '## Ссылки на NFR',
    '<!-- NFR-NN из requirements.md + технические бюджеты; собственных ID-записей не заводить. -->',
    '',
  ].join('\n');
}

export function planTemplate(slug: string, title: string, created: string): string {
  return [
    frontMatter(slug, `${title} — план`, created),
    `# ${title} — план`,
    '',
    '<!-- Задачи: цель + ссылка на §design + file:line базлайна. Без копипасты реализации; единственный источник контрактов — design. -->',
    '',
    '## Задачи',
    '',
    '- [ ] Задача 1: <цель> — design §<раздел>, базлайн <file:line>',
    '',
    '<!-- Исполнитель переворачивает чекбокс в [x] в конце задачи вместе со строкой «сделано → коммит». Чекбокс — истина завершённости. -->',
    '',
  ].join('\n');
}

export function testPlanTemplate(slug: string, title: string, created: string): string {
  return [
    frontMatter(slug, `${title} — тест-план`, created),
    `# ${title} — тест-план`,
    '',
    '<!-- Сценарий на каждый REQ-NN; AC переизобретаться не должны (AC — единый источник). -->',
    '',
    '## Сценарии',
    '',
    '### REQ-01',
    '- Given <контекст>',
    '- When <действие>',
    '- Then <результат>',
    '- Маппинг: <tests/… файл или e2e-сценарий>',
    '',
    '## Прогоны',
    '<!-- Точечные: npx vitest run <путь>; полный гейт: npm run check. -->',
    '',
  ].join('\n');
}

export async function scaffoldArtifact(
  deps: ScaffoldArtifactDeps,
  input: ScaffoldArtifactInput
): Promise<ScaffoldArtifactResult> {
  if (!SLUG_RE.test(input.slug)) {
    throw new UserFacingError(`Invalid slug "${input.slug}" (expected ^[a-z0-9][a-z0-9-]*$)`);
  }
  const now = deps.clock.now();
  const created = now.toISOString().slice(0, 10);
  const dir = join(deps.baseDir, 'docs', 'dev', `${created}-${input.slug}`);
  // Уникальность имён — машина, не дисциплина: отказ ДО любых записей (спека §4-A1).
  if (await deps.fs.exists(dir)) {
    throw new UserFacingError(`Artifact folder already exists: ${dir}`);
  }
  const templates: Record<string, string> = {
    'requirements.md': requirementsTemplate(input.slug, input.slug, created, input.fix),
    'design.md': designTemplate(input.slug, input.slug, created),
    'plan.md': planTemplate(input.slug, input.slug, created),
    'test-plan.md': testPlanTemplate(input.slug, input.slug, created),
  };
  const names = input.fix
    ? ['requirements.md', 'plan.md']
    : ['requirements.md', 'design.md', 'plan.md', 'test-plan.md'];
  const written: string[] = [];
  for (const name of names) {
    const p = join(dir, name);
    await deps.fs.writeFile(p, templates[name]);
    written.push(p);
  }
  return { dir, files: written };
}
