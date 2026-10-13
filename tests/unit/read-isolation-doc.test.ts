import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * NFR-03 (R02), design 2.17.1 §6 — замороженный контракт «изоляция чтения».
 *
 * Изолирован (scope-фильтр) ТОЛЬКО путь `wolf call` (все режимы; канал CLI сегодня,
 * MCP-зеркало call — тот же контракт). Остальные read-пути видят всю память проекта.
 * Расширение списка изолированных путей = изменение требований, а не тихая правка:
 * этот doc-тест ловит (а) дрейф документов от списка и (б) новый изолированный
 * read-путь в коде (предикат видимости вне call-пути / потребитель call-инъекций
 * вне двух каналов контракта).
 */

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

/** Все .ts-файлы под src/ (characterization сканирует код как текст). */
function srcTsFiles(dir = join(root, 'src')): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...srcTsFiles(p));
    else if (e.endsWith('.ts')) out.push(relative(root, p));
  }
  return out.sort();
}

describe('NFR-03 (R02): doc — страница «изоляция чтения» с замороженным списком', () => {
  it('EN-страница существует и содержит оба крыла замороженного списка', () => {
    const doc = read('docs/site/guide/read-isolation.md');
    expect(doc).toContain('## Isolated: `wolf call` only');
    expect(doc).toContain('## Not isolated: the whole project memory');
    expect(doc).toContain('worktree');
    // сентинелы поэлементного состава (Minor-3 ревью T6): не только заголовки
    expect(doc).toContain('`wolf brief`');
    expect(doc).toContain('`owner_skill`');
    expect(doc).toContain('`mr-wolf_brief`');
  });

  it('RU-страница существует и содержит оба крыла замороженного списка', () => {
    const doc = read('docs/site/ru/guide/read-isolation.md');
    expect(doc).toContain('## Изолировано: только `wolf call`');
    expect(doc).toContain('## Не изолировано: вся память проекта');
    expect(doc).toContain('worktree');
    expect(doc).toContain('`wolf brief`');
    expect(doc).toContain('`owner_skill`');
    expect(doc).toContain('`mr-wolf_brief`');
  });

  it('README (EN/RU) содержит раздел «изоляция чтения» с тем же списком', () => {
    const en = read('README.md');
    const ru = read('README.ru.md');
    expect(en).toContain('## Read isolation');
    expect(en).toContain('`wolf call`');
    expect(ru).toContain('## Изоляция чтения');
    expect(ru).toContain('`wolf call`');
  });
});

describe('NFR-03 (R02): code — состав изолированных read-путей соответствует списку', () => {
  const files = srcTsFiles();

  it('предикат видимости (isVisible) живёт только в call-пути доставкe', () => {
    const withPredicate = files.filter((f) => /isVisible/.test(read(f)));
    expect(withPredicate).toEqual(['src/app/use-cases/get-call-injections.ts']);
  });

  it('call-инъекции потребляются только каналами контракта (CLI wolf call; MCP-зеркало)', () => {
    const consumers = files.filter((f) => !f.endsWith('get-call-injections.ts') && /getCallInjections/.test(read(f)));
    expect(consumers).toEqual(['src/adapters/cli/commands/memory-call.ts']);
    // MCP-зеркало (mcp-tools.ts) сегодня не входит: каталог MCP (search/get/list/
    // add/transition/brief/recap + ping) не содержит call-тула. Появление
    // изолированного MCP-call — легитимная эволюция контракта: добавить файл сюда
    // И в замороженный список на странице/README в одном изменении требований.
  });
});
