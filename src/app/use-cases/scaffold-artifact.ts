import { join } from 'path';
import { Clock } from '../../ports/clock.port.js';
import { FileSystem } from '../../ports/file-system.port.js';
import { UserFacingError } from '../../domain/errors.js';
import type { ClaimGuard } from './claim-artifact.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export interface ScaffoldArtifactDeps {
  clock: Clock;
  fs: Pick<FileSystem, 'exists' | 'writeFile'>;
  baseDir: string;
  /** 2.17.1 REQ-05 (R06): запись TASK-бриф сета требует активный claim
   * (артефакт `dev:<created>-<slug>`); CLI передаёт реальный guard из
   * makeClaimGuard, юнит-тесты шаблонов — заглушку. */
  claims: ClaimGuard;
}

export interface ScaffoldArtifactInput {
  slug: string;
  fix: boolean;
}

export interface ScaffoldArtifactResult {
  dir: string;
  /** Файлы, созданные этим запуском (при top-up — только недостающие). */
  files: string[];
  /** Файлы, которые уже были на месте: никогда не перезаписываются (Q4). */
  existing: string[];
  /** true — пакет уже полон, добавлять было нечего. */
  complete: boolean;
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
      `### CR-${created}-01 — <название изменения>`,
      '',
      '<что и почему>',
      '',
      '- утвердил: <кто>',
      '',
      '- downstream: <артефакты или «нет»>',
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
    '- AC: <измеримый критерий; нетривиальные — сценариями>',
    '  - Given <контекст>',
    '  - When <действие>',
    '  - Then <измеримый результат>',
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
    `### CR-${created}-01 — <название изменения>`,
    '',
    '<что и почему>',
    '',
    '- затронуто: <REQ/NFR>',
    '',
    '- утвердил: <кто>',
    '',
    '- downstream: <артефакты или «нет»>',
    '',
  ].join('\n');
}

/** 2.32.0 (Q5): pre-requirements — первый документ пакета. Фиксирует намерение и
 *  рамку до формальных требований; не заменяет requirements и не утверждает их. */
export function preRequirementsTemplate(slug: string, title: string, created: string): string {
  return [
    frontMatter(slug, `${title} — pre-requirements`, created),
    `# ${title} — pre-requirements`,
    '',
    '<!-- Итог обсуждения до требований: зачем, что уже решено, что открыто. Не утверждает требования. -->',
    '',
    '## 1. Намерение и польза',
    '<!-- Что хотим получить и какую проблему это решает; словами владельца, без решения. -->',
    '',
    '## 2. Рамка и ключевые решения',
    '<!-- Согласованная рамка: границы, принятые решения, источники (тред/жалоба/ревью). -->',
    '',
    '## 3. Открытые вопросы',
    '<!-- Что ещё не решено; у каждого — кому адресован и что блокирует. -->',
    '',
    '## 4. Что дальше',
    '<!-- Переход к требованиям: что фиксируем как REQ/NFR, какие документы появятся. -->',
    '',
  ].join('\n');
}

/** 2.32.0 (Q5): change-request.md — запросы на изменение пакета. Отдельный
 *  документ ≠ раздел «Журнал изменений (CR)» в requirements.md (тот журнал
 *  описывает изменения самих требований). */
export function changeRequestTemplate(slug: string, title: string, created: string): string {
  return [
    frontMatter(slug, `${title} — запросы на изменение`, created),
    `# ${title} — запросы на изменение (CR)`,
    '',
    '<!-- Append-only: новые записи вниз, старые не редактируются. Один CR — одно изменение пакета. -->',
    '<!-- Поток: замечание → change-request → pre-requirements/requirements → design → test-plan → plan. -->',
    '<!-- Номер локален для пакета: CR-<YYYY-MM-DD>-NN (NN — порядковый номер внутри дня). -->',
    '',
    '## Запросы',
    '',
    `### CR-${created}-01 — <название изменения>`,
    '',
    '<что и почему>',
    '',
    '- затронуто: <REQ/NFR или "нет">',
    '',
    '- утвердил: <кто>',
    '',
    '- downstream: <артефакты или "нет">',
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
    '### ADR-1 — <Название решения>',
    '',
    '- Контекст: <что побуждает к выбору>',
    '',
    '- Решение: <что выбрали и почему это лучше альтернатив>',
    '',
    '- Последствия: <эффекты, риски, что упрощается/усложняется>',
    '',
    '- Статус: proposed',
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
    '  - Шаг: <поддействие>',
    '  - Шаг: <поддействие>',
    '',
    '<!-- Шаги — для длинной задачи; короткой достаточно строки с чекбоксом. -->',
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
  const folder = `${created}-${input.slug}`;
  // REQ-05 AC-3: guard до любой записи — без claim запись отклоняется в use-case
  deps.claims.requireClaim(`dev:${folder}`);
  const dir = join(deps.baseDir, 'docs', 'dev', folder);
  const templates: Record<string, string> = {
    'pre-requirements.md': preRequirementsTemplate(input.slug, input.slug, created),
    'requirements.md': requirementsTemplate(input.slug, input.slug, created, input.fix),
    'change-request.md': changeRequestTemplate(input.slug, input.slug, created),
    'design.md': designTemplate(input.slug, input.slug, created),
    'plan.md': planTemplate(input.slug, input.slug, created),
    'test-plan.md': testPlanTemplate(input.slug, input.slug, created),
  };
  // Q4 (a): top-up. Папка могла появиться из brainstorm (pre-requirements.md);
  // существующие документы не перезаписываются ни при каких условиях.
  const names = input.fix
    ? ['requirements.md', 'plan.md']
    : ['pre-requirements.md', 'requirements.md', 'change-request.md', 'design.md', 'test-plan.md', 'plan.md'];
  const written: string[] = [];
  const existing: string[] = [];
  for (const name of names) {
    const p = join(dir, name);
    if (await deps.fs.exists(p)) {
      existing.push(p);
      continue;
    }
    await deps.fs.writeFile(p, templates[name]);
    written.push(p);
  }
  return { dir, files: written, existing, complete: written.length === 0 };
}
