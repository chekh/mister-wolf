import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';

/**
 * PATCH-2-21-1: изоляция схем памяти между проектами в ОДНОМ процессе.
 *
 * Схема типов кэшируется в модуле markdown-memory-store; до фикса кэш был
 * один на процесс, поэтому первый проект «навязывал» свою таксономию всем
 * следующим (wolf upgrade создаёт store для чужих root в том же процессе).
 *
 * Оба корня — в одном файле теста намеренно: vitest изолирует реестр модулей
 * ПО ФАЙЛУ, разнесение корней по двум файлам дало бы ложный GREEN.
 */

// Проект A: project-тип iso-probe с обязательным полем marker.
const CONFIG_MARKER_REQUIRED = `artifact_sources: []
memory_types:
  core: {}
  project:
    iso-probe:
      lifecycle: [active, completed]
      subdir_thread: ~
      subdir_shared: iso-probe
      fields:
        marker:
          kind: string
          required: true
`;

// Проект B: тот же тип, но marker опционально.
const CONFIG_MARKER_OPTIONAL = `artifact_sources: []
memory_types:
  core: {}
  project:
    iso-probe:
      lifecycle: [active, completed]
      subdir_thread: ~
      subdir_shared: iso-probe
      fields:
        marker:
          kind: string
          optional: true
`;

// Проект C: свой project-тип, iso-probe не объявлен.
const CONFIG_OTHER_TYPE = `artifact_sources: []
memory_types:
  core: {}
  project:
    other-probe:
      lifecycle: [active, completed]
      subdir_thread: ~
      subdir_shared: other-probe
`;

// Проекты D и E: per-project словарь фасетов core-типа note (2.13 §5.3).
// Один и тот же core-тип note имеет разную схему facet в разных проектах.
const CONFIG_FACETS_A = `artifact_sources: []
facets:
  character:
    - custom-a
    - howto
    - pitfall
    - context
    - metric
    - history
    - legacy
`;

const CONFIG_FACETS_B = `artifact_sources: []
facets:
  character:
    - custom-b
    - howto
    - pitfall
    - context
    - metric
    - history
    - legacy
`;

describe('MarkdownMemoryStore: изоляция схем типов между проектами', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function makeRoot(config: string): string {
    const root = mkdtempSync(join(tmpdir(), 'wolf-iso-'));
    roots.push(root);
    mkdirSync(join(root, '.wolf'), { recursive: true });
    writeFileSync(join(root, '.wolf', 'config.yaml'), config, 'utf-8');
    return root;
  }

  /** Объект типа iso-probe в shared/iso-probe/ — путь, который выбрал бы targetPathFor. */
  function writeProbe(root: string, id: string, extra: Record<string, unknown>): void {
    const frontmatter = {
      id,
      type: 'iso-probe',
      title: 'Isolation probe',
      status: 'active',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-10-27T10:00:00Z',
      updated_at: '2026-10-27T10:00:00Z',
      created_by: 'user:test',
      source: { kind: 'manual' },
      ...extra,
    };
    writeMemory(root, ['shared', 'iso-probe'], id, frontmatter);
  }

  /** Заметка типа note в shared/notes/ — facet по словарю проекта. */
  function writeNote(root: string, id: string, facet: string): void {
    const frontmatter = {
      id,
      type: 'note',
      title: 'Facet probe',
      status: 'active',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-10-27T10:00:00Z',
      updated_at: '2026-10-27T10:00:00Z',
      created_by: 'user:test',
      source: { kind: 'manual' },
      facet,
    };
    writeMemory(root, ['shared', 'notes'], id, frontmatter);
  }

  function writeMemory(root: string, subdir: string[], id: string, frontmatter: Record<string, unknown>): void {
    const path = join(root, '.wolf', 'memory', ...subdir, `${id}.md`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `---\n${yaml.dump(frontmatter).trimEnd()}\n---\n\nBody.`, 'utf-8');
  }

  it('валидирует каждый проект по его собственной схеме типов', async () => {
    const rootA = makeRoot(CONFIG_MARKER_REQUIRED);
    const rootB = makeRoot(CONFIG_MARKER_OPTIONAL);
    const rootC = makeRoot(CONFIG_OTHER_TYPE);

    writeProbe(rootA, 'mem_iso_a_ok', { marker: 'alpha' });
    writeProbe(rootA, 'mem_iso_a_no_marker', {});
    writeProbe(rootB, 'mem_iso_b_no_marker', {});
    writeProbe(rootC, 'mem_iso_c_unknown_type', {});

    const problemsA: string[] = [];
    const problemsB: string[] = [];
    const problemsC: string[] = [];
    const storeA = new MarkdownMemoryStore(rootA, (m) => problemsA.push(m));
    const storeB = new MarkdownMemoryStore(rootB, (m) => problemsB.push(m));
    const storeC = new MarkdownMemoryStore(rootC, (m) => problemsC.push(m));

    // A: marker обязателен → объект с marker валиден по схеме A.
    expect((await storeA.get('mem_iso_a_ok'))?.id).toBe('mem_iso_a_ok');

    // A: объект без marker невалиден по СВОЕЙ схеме A.
    expect(await storeA.get('mem_iso_a_no_marker')).toBeNull();
    expect(problemsA.some((m) => m.includes('mem_iso_a_no_marker'))).toBe(true);

    // B: тот же тип с другим определением → объект без marker валиден по схеме B.
    // До фикса кэш был один на процесс: B валидировался по схеме A (marker обязателен).
    expect((await storeB.get('mem_iso_b_no_marker'))?.id).toBe('mem_iso_b_no_marker');
    expect(problemsB).toEqual([]);
    const listedB = await storeB.list({ type: 'iso-probe' });
    expect(listedB.map((o) => o.id)).toEqual(['mem_iso_b_no_marker']);

    // C: тип не объявлен → таксономия A/B не наследуется, объект не читается.
    expect(await storeC.get('mem_iso_c_unknown_type')).toBeNull();
    expect(problemsC.some((m) => m.includes('Unknown memory type'))).toBe(true);
  });

  it('не наследует схему при обратном порядке чтения корней', async () => {
    // Свежие корни: кэш процессный — обратный порядок проверяется на чистом состоянии.
    const rootRequired = makeRoot(CONFIG_MARKER_REQUIRED);
    const rootOptional = makeRoot(CONFIG_MARKER_OPTIONAL);

    writeProbe(rootRequired, 'mem_iso_rev_required_no_marker', {});
    writeProbe(rootOptional, 'mem_iso_rev_optional_no_marker', {});

    const problemsRequired: string[] = [];
    const problemsOptional: string[] = [];
    const storeOptional = new MarkdownMemoryStore(rootOptional, (m) => problemsOptional.push(m));
    const storeRequired = new MarkdownMemoryStore(rootRequired, (m) => problemsRequired.push(m));

    // Первым читается проект с опциональным marker.
    expect((await storeOptional.get('mem_iso_rev_optional_no_marker'))?.id).toBe('mem_iso_rev_optional_no_marker');
    expect(problemsOptional).toEqual([]);

    // Вторым — проект с обязательным marker: его схема действует, чужая не наследуется.
    expect(await storeRequired.get('mem_iso_rev_required_no_marker')).toBeNull();
    expect(problemsRequired.some((m) => m.includes('mem_iso_rev_required_no_marker'))).toBe(true);
  });

  it('изолирует per-project схему core-типа note (словарь facets.character)', async () => {
    const rootFacetsA = makeRoot(CONFIG_FACETS_A);
    const rootFacetsB = makeRoot(CONFIG_FACETS_B);

    writeNote(rootFacetsA, 'mem_note_facet_a', 'custom-a');
    writeNote(rootFacetsB, 'mem_note_facet_b', 'custom-b');

    const problemsA: string[] = [];
    const problemsB: string[] = [];
    const storeA = new MarkdownMemoryStore(rootFacetsA, (m) => problemsA.push(m));
    const storeB = new MarkdownMemoryStore(rootFacetsB, (m) => problemsB.push(m));

    // note с facet из словаря своего проекта — валиден по своей схеме.
    expect((await storeA.get('mem_note_facet_a'))?.id).toBe('mem_note_facet_a');
    expect((await storeB.get('mem_note_facet_b'))?.id).toBe('mem_note_facet_b');
    expect(problemsA).toEqual([]);
    expect(problemsB).toEqual([]);

    // note с чужим facet отвергается схемой своего проекта (словари не смешиваются).
    writeNote(rootFacetsA, 'mem_note_facet_b_in_a', 'custom-b');
    writeNote(rootFacetsB, 'mem_note_facet_a_in_b', 'custom-a');
    expect(await storeA.get('mem_note_facet_b_in_a')).toBeNull();
    expect(await storeB.get('mem_note_facet_a_in_b')).toBeNull();
  });
});
