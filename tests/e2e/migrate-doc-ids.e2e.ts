import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, cpSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { ensureBuilt, runCli, repoRoot } from './helpers.js';

/**
 * E2E миграции id document-ref (спека 2.1.0 §2.6, AC6): dry-run → apply →
 * перепись ссылок → list/search/brief живы. Фикстура — копия памяти площадки
 * (если есть), иначе синтетический клон. Реальный playground НЕ трогаем.
 */
const playgroundWolf = join(repoRoot, 'playground', '.wolf');
const CREATED = '2026-08-30T10:00:00Z';

/** Изолированное окружение: tmp XDG, чтобы e2e не трогал реальный ~/.config/wolf. */
function env(xdg: string): NodeJS.ProcessEnv {
  return { XDG_CONFIG_HOME: xdg };
}

function md(fm: Record<string, any>, body: string): string {
  return `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body}`;
}

function docFm(id: string, path: string, title: string): Record<string, any> {
  return {
    id,
    type: 'document-ref',
    title,
    status: 'active',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.6,
    created_at: CREATED,
    updated_at: CREATED,
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'file', path },
    related: { files: [], docs: [path], decisions: [] },
    tags: ['document'],
    superseded_by: null,
  };
}

/** Синтетический клон памяти: 5 doc_* + decision с superseded_by + relation. */
function seedSynthetic(project: string): void {
  const mem = join(project, '.wolf', 'memory');
  const docs = join(mem, 'shared', 'documents');
  const decisions = join(mem, 'shared', 'decisions');
  mkdirSync(docs, { recursive: true });
  mkdirSync(decisions, { recursive: true });
  const files: Array<[id: string, path: string, title: string]> = [
    ['doc_docs_guide_architecture_md', 'docs/guide/architecture.md', 'Architecture guide'],
    ['doc_README_md', 'README.md', 'Readme overview'],
    ['doc_docs_superpowers_plans_roadmap_2_md', 'docs/superpowers/plans/roadmap-v2.md', 'Roadmap v2 plan'],
    ['doc_src_adapters_fs_document_id_ts', 'src/adapters/fs/document-id.ts', 'Document id generator'],
    ['doc_package_json', 'package.json', 'Package manifest'],
  ];
  for (const [id, path, title] of files)
    writeFileSync(join(docs, `${id}.md`), md(docFm(id, path, title), `Registered project document: ${path}`));
  writeFileSync(
    join(decisions, 'dec_mig.md'),
    md(
      {
        id: 'dec_mig',
        type: 'decision',
        title: 'Держать документы как document-ref',
        status: 'active',
        review_state: 'accepted',
        confidence: 'medium',
        importance: 0.5,
        created_at: CREATED,
        updated_at: CREATED,
        created_by: 'user:test',
        schema_version: 1,
        source: { kind: 'manual' },
        related: { files: [], docs: [], decisions: [] },
        tags: [],
        superseded_by: 'doc_docs_guide_architecture_md',
      },
      'Смотрел doc_README_md и doc_package_json.'
    )
  );
  writeFileSync(
    join(mem, 'relations.jsonl'),
    JSON.stringify({
      id: 'rel_mig',
      subject: 'dec_mig',
      predicate: 'related_to',
      object: 'doc_docs_guide_architecture_md',
      created_at: CREATED,
      source: 'manual',
      confidence: 'medium',
    }) + '\n'
  );
  writeFileSync(join(mem, 'events.jsonl'), '');
}

function walkMdSync(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.name.endsWith('.md')) out.push(full);
    }
  }
  return out;
}

function isService(rel: string): boolean {
  // briefs/quarantine — служебные зоны, миграция их не трогает
  return rel.startsWith('briefs/') || rel.startsWith('quarantine/');
}

/** Все старые id (doc_*) из frontmatter объектов памяти. */
function collectDocIds(project: string): string[] {
  const mem = join(project, '.wolf', 'memory');
  const ids: string[] = [];
  for (const f of walkMdSync(mem)) {
    if (isService(f.slice(mem.length + 1))) continue;
    const m = readFileSync(f, 'utf-8').match(/^id: (doc_\S+)/m);
    if (m) ids.push(m[1]);
  }
  return ids;
}

function countMd(project: string): number {
  return walkMdSync(join(project, '.wolf', 'memory')).length;
}

/** Слово из заголовка первого document-ref — запрос для `search` после миграции. */
function searchWord(project: string): string {
  const mem = join(project, '.wolf', 'memory');
  for (const f of walkMdSync(mem)) {
    if (isService(f.slice(mem.length + 1))) continue;
    const content = readFileSync(f, 'utf-8');
    if (!/^type: document-ref$/m.test(content)) continue;
    const title = content.match(/^title: (.+)$/m)?.[1] ?? '';
    const words = title.toLowerCase().match(/[a-zа-яё]{4,}/g) ?? [];
    if (words.length > 0) return words.sort((a, b) => b.length - a.length)[0];
  }
  return 'document'; // fallback: слово точно есть в bodies
}

describe('wolf migrate doc-ids (спека 2.1.0 §2.6, AC6: копия памяти, ссылки переписаны)', () => {
  let project: string;
  let xdg: string;
  let oldIds: string[];

  beforeAll(() => {
    ensureBuilt();
    project = mkdtempSync(join(tmpdir(), 'wolf-migrate-docids-'));
    writeFileSync(join(project, 'package.json'), '{ "name": "migrate-docids-e2e" }');
    xdg = mkdtempSync(join(tmpdir(), 'wolf-migrate-docids-xdg-'));
    if (existsSync(join(playgroundWolf, 'memory'))) {
      // весь .wolf целиком (config.yaml тоже) — schema-guard пройдёт; playground не трогаем
      cpSync(playgroundWolf, join(project, '.wolf'), { recursive: true });
    } else {
      seedSynthetic(project);
    }
    oldIds = collectDocIds(project);
    expect(oldIds.length).toBeGreaterThan(0);
  });

  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
    rmSync(xdg, { recursive: true, force: true });
  });

  it('(a) dry-run показывает план и ничего не меняет', () => {
    const n1 = countMd(project);
    const dry = runCli(['migrate', 'doc-ids'], project, env(xdg));
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain('mode: dry-run');
    expect(dry.stdout).toContain(oldIds[0]);
    expect(countMd(project)).toBe(n1);
  });

  it('(b) --apply переименовывает, число .md неизменно', () => {
    const n1 = countMd(project);
    const apply = runCli(['migrate', 'doc-ids', '--apply'], project, env(xdg));
    expect(apply.status).toBe(0); // конфликты дали бы exit 2
    expect(apply.stdout).toMatch(/renamed: [1-9]/);
    expect(countMd(project)).toBe(n1);
  });

  it('(c) старых id нет нигде: .md + relations.jsonl (по границе id)', () => {
    const mem = join(project, '.wolf', 'memory');
    const texts: string[] = [];
    for (const f of walkMdSync(mem)) {
      if (isService(f.slice(mem.length + 1))) continue;
      texts.push(readFileSync(f, 'utf-8'));
    }
    const rel = join(mem, 'relations.jsonl');
    if (existsSync(rel)) texts.push(readFileSync(rel, 'utf-8'));
    const all = texts.join('\n');
    for (const id of oldIds) {
      const hits = all.match(new RegExp(`${id}(?![A-Za-z0-9_-])`, 'g'));
      expect(hits, `старый id ${id} всё ещё в памяти`).toBeNull();
    }
  });

  it('(d) list/search/brief работают после миграции', () => {
    const list = runCli(['list', '--type', 'document-ref'], project, env(xdg));
    expect(list.status).toBe(0);
    expect(list.stdout.trim().length).toBeGreaterThan(0);

    const search = runCli(['search', searchWord(project)], project, env(xdg));
    expect(search.status).toBe(0);

    const brief = runCli(['brief'], project, env(xdg)); // brief делает scan — это ок
    expect(brief.status).toBe(0);
  });
});
