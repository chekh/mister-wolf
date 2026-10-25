import { describe, it, expect } from 'vitest';
import {
  NEEDS_DECISION_CODES,
  verifyAgainstMap,
  type SyncVerifyOutcome,
  type VerifyCode,
  type VerifyOutcomes,
} from '../../../src/app/use-cases/verify-against-map.js';
import type { FaceEntry, FileEntry, UpdateCategory, UpdateMap } from '../../../src/adapters/fs/update-map.js';
import type { SeedOutcome } from '../../../src/app/use-cases/seed-base-playbooks.js';

/** FileEntry карты: path относительно templates/ (kind задаёт корень проекта). */
function f(path: string, category: UpdateCategory, kind: FileEntry['kind'] = 'agent'): FileEntry {
  return { path, kind, category };
}

function face(template: string, seed = true): FaceEntry {
  return { template, owner_skill: template, category: 'new', seed };
}

function map(partial: Partial<UpdateMap> = {}): UpdateMap {
  return {
    version: '2.19.0',
    prev: '2.18.5',
    files: [],
    faces: [],
    agents_md: { category: 'new', mode: 'append-block' },
    schema_migrations: [],
    outside_v1: [],
    ...partial,
  };
}

function run(m: UpdateMap, o: Partial<VerifyOutcomes> = {}) {
  return verifyAgainstMap(m, { syncOutcomes: [], seedOutcomes: [], removals: [], ...o });
}

/** Проектный путь для map-пути (LAYOUT opencode-renderer.ts): base/commands → .opencode/command. */
function proj(mapPath: string): string {
  const pairs: Array<[string, string]> = [
    ['base/agents/', '.opencode/agents/'],
    ['base/skills/', '.opencode/skills/'],
    ['base/commands/', '.opencode/command/'],
    ['opencode/plugins/', '.opencode/plugins/'],
  ];
  for (const [src, dst] of pairs) if (mapPath.startsWith(src)) return dst + mapPath.slice(src.length);
  return mapPath;
}

describe('verifyAgainstMap (design §«Сверка»: ожидание из карты × факт из outcomes)', () => {
  describe('таблица: категория карты × факт → код исхода', () => {
    interface Row {
      name: string;
      files?: FileEntry[];
      faces?: FaceEntry[];
      agentsCategory?: UpdateCategory;
      sync?: SyncVerifyOutcome[];
      seed?: SeedOutcome[];
      removals?: string[];
      target: string;
      code: VerifyCode | 'error';
      needsDecision?: boolean;
    }

    const rows: Row[] = [
      // new|changed → updated | created
      {
        name: 'new + sync created → created',
        files: [f('base/agents/new-agent.md', 'new')],
        sync: [{ file: proj('base/agents/new-agent.md'), action: 'created' }],
        target: 'base/agents/new-agent.md',
        code: 'created',
      },
      {
        name: 'new + sync updated → updated',
        files: [f('base/agents/new-agent.md', 'new')],
        sync: [{ file: proj('base/agents/new-agent.md'), action: 'updated' }],
        target: 'base/agents/new-agent.md',
        code: 'updated',
      },
      {
        name: 'changed + sync updated → updated',
        files: [f('base/skills/ponytail/SKILL.md', 'changed', 'skill')],
        sync: [{ file: proj('base/skills/ponytail/SKILL.md'), action: 'updated' }],
        target: 'base/skills/ponytail/SKILL.md',
        code: 'updated',
      },
      {
        name: 'changed + sync created (старый проект не имел файла) → created',
        files: [f('base/commands/ponytail.md', 'changed', 'command')],
        sync: [{ file: proj('base/commands/ponytail.md'), action: 'created' }],
        target: 'base/commands/ponytail.md',
        code: 'created',
      },
      {
        name: 'plugin-цель: путь opencode/plugins/ маппится в .opencode/plugins/',
        files: [f('opencode/plugins/rtk.ts', 'new', 'plugin')],
        sync: [{ file: proj('opencode/plugins/rtk.ts'), action: 'created' }],
        target: 'opencode/plugins/rtk.ts',
        code: 'created',
      },
      {
        name: 'new + identical-skip (повтор прогона, NFR-02) → skipped-identical, НЕ требует решения',
        files: [f('base/agents/new-agent.md', 'new')],
        sync: [{ file: proj('base/agents/new-agent.md'), action: 'skipped', reason: 'content identical (M2)' }],
        target: 'base/agents/new-agent.md',
        code: 'skipped-identical',
        needsDecision: false,
      },
      // unchanged → unchanged | updated | skipped-identical
      {
        name: 'unchanged + identical-skip → unchanged',
        files: [f('base/agents/core.md', 'unchanged')],
        sync: [{ file: proj('base/agents/core.md'), action: 'skipped', reason: 'content identical (M2)' }],
        target: 'base/agents/core.md',
        code: 'unchanged',
      },
      {
        name: 'unchanged + sync updated (старый проект отстаёт) → updated',
        files: [f('base/agents/core.md', 'unchanged')],
        sync: [{ file: proj('base/agents/core.md'), action: 'updated' }],
        target: 'base/agents/core.md',
        code: 'updated',
      },
      {
        name: 'unchanged + sync created (файла не было) → created',
        files: [f('base/agents/core.md', 'unchanged')],
        sync: [{ file: proj('base/agents/core.md'), action: 'created' }],
        target: 'base/agents/core.md',
        code: 'created',
      },
      // мутант перекрывает ожидание → «требует решения»
      {
        name: 'changed + mutated-skip → skipped-mutated + needs-decision (R11.3: не error)',
        files: [f('base/agents/changed.md', 'changed')],
        sync: [{ file: proj('base/agents/changed.md'), action: 'skipped', mutated: true }],
        target: 'base/agents/changed.md',
        code: 'skipped-mutated',
        needsDecision: true,
      },
      {
        name: 'unchanged + mutated-skip → skipped-mutated + needs-decision',
        files: [f('base/agents/core.md', 'unchanged')],
        sync: [{ file: proj('base/agents/core.md'), action: 'skipped', mutated: true }],
        target: 'base/agents/core.md',
        code: 'skipped-mutated',
        needsDecision: true,
      },
      {
        name: 'changed + unstamped conflict → conflict + needs-decision',
        files: [f('base/agents/changed.md', 'changed')],
        sync: [{ file: proj('base/agents/changed.md'), action: 'conflict', reason: 'unstamped in place' }],
        target: 'base/agents/changed.md',
        code: 'conflict',
        needsDecision: true,
      },
      // removed → removed
      {
        name: 'removed + подтверждённое отсутствие (removals) → removed',
        files: [f('base/agents/gone.md', 'removed')],
        removals: [proj('base/agents/gone.md')],
        target: 'base/agents/gone.md',
        code: 'removed',
      },
      {
        name: 'removed без статуса удаления → error',
        files: [f('base/agents/gone.md', 'removed')],
        target: 'base/agents/gone.md',
        code: 'error',
      },
      // deprecated → файл на месте + deprecated-noted
      {
        name: 'deprecated + identical (файл на месте) → deprecated-noted',
        files: [f('base/agents/legacy.md', 'deprecated')],
        sync: [{ file: proj('base/agents/legacy.md'), action: 'skipped', reason: 'content identical (M2)' }],
        target: 'base/agents/legacy.md',
        code: 'deprecated-noted',
      },
      {
        name: 'deprecated + updated (файл на месте, приведён) → deprecated-noted',
        files: [f('base/agents/legacy.md', 'deprecated')],
        sync: [{ file: proj('base/agents/legacy.md'), action: 'updated' }],
        target: 'base/agents/legacy.md',
        code: 'deprecated-noted',
      },
      {
        name: 'негативный: deprecated удалён вручную (sync пересоздал) → conflict + needs-decision, НЕ error',
        files: [f('base/agents/legacy.md', 'deprecated')],
        sync: [{ file: proj('base/agents/legacy.md'), action: 'created' }],
        target: 'base/agents/legacy.md',
        code: 'conflict',
        needsDecision: true,
      },
      {
        name: 'deprecated + mutated → skipped-mutated + needs-decision',
        files: [f('base/agents/legacy.md', 'deprecated')],
        sync: [{ file: proj('base/agents/legacy.md'), action: 'skipped', mutated: true }],
        target: 'base/agents/legacy.md',
        code: 'skipped-mutated',
        needsDecision: true,
      },
      // faces[seed=true] → seeded | skipped-live | legacy-absorbed | diverged
      {
        name: 'face seed=true + kind seeded → seeded',
        faces: [face('base/playbooks/executor-lead.md')],
        seed: [{ file: 'executor-lead.md', action: 'created', kind: 'seeded' }],
        target: 'base/playbooks/executor-lead.md',
        code: 'seeded',
      },
      {
        name: 'face seed=true + kind skipped-live → skipped-live (не требует решения)',
        faces: [face('base/playbooks/worker-implementer.md')],
        seed: [{ file: 'worker-implementer.md', action: 'skipped', kind: 'skipped-live' }],
        target: 'base/playbooks/worker-implementer.md',
        code: 'skipped-live',
      },
      {
        name: 'face seed=true + kind legacy-absorbed → legacy-absorbed',
        faces: [face('base/playbooks/executor-lead.md')],
        seed: [{ file: 'executor-lead.md', action: 'created', kind: 'legacy-absorbed' }],
        target: 'base/playbooks/executor-lead.md',
        code: 'legacy-absorbed',
      },
      {
        name: 'face seed=true + kind diverged → diverged + needs-decision',
        faces: [face('base/playbooks/executor-lead.md')],
        seed: [{ file: 'executor-lead.md', action: 'diverged', kind: 'diverged' }],
        target: 'base/playbooks/executor-lead.md',
        code: 'diverged',
        needsDecision: true,
      },
      {
        name: 'face seed=true без исхода посева → error',
        faces: [face('base/playbooks/executor-lead.md')],
        target: 'base/playbooks/executor-lead.md',
        code: 'error',
      },
      {
        name: 'face seed=true + исход без kind (легаси-режим посева) → error: статус отсутствует структурно',
        faces: [face('base/playbooks/executor-lead.md')],
        seed: [{ file: 'executor-lead.md', action: 'skipped', reason: 'active face matches template' }],
        target: 'base/playbooks/executor-lead.md',
        code: 'error',
      },
      // faces[seed=false] (deprecated-шаблон лица) — репортится, не мутируется
      {
        name: 'face seed=false без исхода → deprecated-noted (R10.4: репортится, не мутируется)',
        faces: [face('base/playbooks/old-face.md', false)],
        target: 'base/playbooks/old-face.md',
        code: 'deprecated-noted',
      },
      {
        name: 'face seed=false + факт посева → conflict + needs-decision (мутировать deprecated-лицо нельзя)',
        faces: [face('base/playbooks/old-face.md', false)],
        seed: [{ file: 'old-face.md', action: 'created', kind: 'seeded' }],
        target: 'base/playbooks/old-face.md',
        code: 'conflict',
        needsDecision: true,
      },
      // agents_md (append-block)
      {
        name: 'agents_md + sync created → created',
        agentsCategory: 'new',
        sync: [{ file: 'AGENTS.md', action: 'created' }],
        target: 'AGENTS.md',
        code: 'created',
      },
      {
        name: 'agents_md append-block skip (нет штампа — блок не принадлежит sync) → без needs-decision',
        agentsCategory: 'unchanged',
        sync: [{ file: 'AGENTS.md', action: 'skipped', reason: 'no stamp (append block)' }],
        target: 'AGENTS.md',
        code: 'unchanged',
        needsDecision: false,
      },
      {
        name: 'agents_md без исхода → error',
        target: 'AGENTS.md',
        code: 'error',
      },
      // факт без ожидания → conflict → «требует решения»
      {
        name: 'sync-исход по файлу вне карты → conflict + needs-decision',
        sync: [{ file: '.opencode/agents/stranger.md', action: 'created' }],
        target: '.opencode/agents/stranger.md',
        code: 'conflict',
        needsDecision: true,
      },
      {
        name: 'seed-исход по шаблону вне карты → conflict + needs-decision',
        seed: [{ file: 'stranger.md', action: 'created', kind: 'seeded' }],
        target: 'stranger.md',
        code: 'conflict',
        needsDecision: true,
      },
      {
        name: 'removal по пути, не объявленному removed в карте → conflict + needs-decision',
        removals: ['.opencode/agents/undeclared.md'],
        target: '.opencode/agents/undeclared.md',
        code: 'conflict',
        needsDecision: true,
      },
    ];

    for (const r of rows) {
      it(r.name, () => {
        const m = map({
          files: r.files ?? [],
          faces: r.faces ?? [],
          ...(r.agentsCategory !== undefined
            ? { agents_md: { category: r.agentsCategory, mode: 'append-block' as const } }
            : {}),
        });
        const result = run(m, { syncOutcomes: r.sync ?? [], seedOutcomes: r.seed ?? [], removals: r.removals ?? [] });
        const item = result.items.find((i) => i.target === r.target);
        expect(item, `item for ${r.target}`).toBeDefined();
        expect(item?.code).toBe(r.code);
        expect(item?.needsDecision ?? false).toBe(r.needsDecision ?? false);
      });
    }

    it('R11.5: changed-цель без sync-исхода → error проекта (счётчик errors)', () => {
      const result = run(map({ files: [f('base/agents/lost.md', 'changed')] }));
      const item = result.items.find((i) => i.target === 'base/agents/lost.md');
      expect(item?.code).toBe('error');
      expect(result.summary.errors).toBeGreaterThanOrEqual(1);
    });
  });

  it('R10.3: карта одной версии, проект «старый» — сверка по ПОЛНОМУ составу (unchanged не срезает проверку)', () => {
    const m = map({
      files: [
        f('base/agents/new.md', 'new'),
        f('base/agents/changed.md', 'changed'),
        f('base/agents/unchanged.md', 'unchanged'),
        f('base/agents/deprecated.md', 'deprecated'),
        f('base/agents/gone.md', 'removed'),
      ],
      faces: [face('base/playbooks/executor-lead.md')],
      agents_md: { category: 'unchanged', mode: 'append-block' },
    });
    // «старый» проект: всё отстаёт, deprecated на месте, gone ещё лежит
    const result = run(m, {
      syncOutcomes: [
        { file: proj('base/agents/new.md'), action: 'created' },
        { file: proj('base/agents/changed.md'), action: 'updated' },
        { file: proj('base/agents/unchanged.md'), action: 'updated' }, // unchanged-файл тоже догоняется
        { file: proj('base/agents/deprecated.md'), action: 'skipped', reason: 'content identical (M2)' },
        { file: 'AGENTS.md', action: 'updated' },
      ],
      seedOutcomes: [{ file: 'executor-lead.md', action: 'created', kind: 'seeded' }],
      removals: [proj('base/agents/gone.md')],
    });

    // каждый пункт карты получил статус: files + faces + agents_md
    expect(result.items).toHaveLength(5 + 1 + 1);
    expect(result.summary.errors).toBe(0);
    const byTarget = new Map(result.items.map((i) => [i.target, i.code]));
    for (const path of m.files.map((e) => e.path)) {
      expect(byTarget.get(path), `${path} должен иметь статус`).toBeDefined();
    }
    // категория unchanged не срезает проверку: файл получил код updated, а не «пропущен»
    expect(byTarget.get('base/agents/unchanged.md')).toBe('updated');
    expect(byTarget.get('base/agents/deprecated.md')).toBe('deprecated-noted');
    expect(byTarget.get('base/agents/gone.md')).toBe('removed');
    expect(result.summary.needsDecision).toBe(0);
  });

  it('сводка: счётчики по кодам + needs-decision + errors на смешанном кейсе', () => {
    const m = map({
      files: [
        f('base/agents/a.md', 'new'),
        f('base/agents/b.md', 'changed'),
        f('base/agents/c.md', 'unchanged'),
        f('base/agents/d.md', 'unchanged'),
        f('base/agents/e.md', 'deprecated'),
        f('base/agents/g.md', 'removed'),
        f('base/agents/h.md', 'changed'), // без исхода → error
      ],
      faces: [face('base/playbooks/executor-lead.md'), face('base/playbooks/worker-implementer.md')],
      agents_md: { category: 'new', mode: 'append-block' },
    });
    const result = run(m, {
      syncOutcomes: [
        { file: proj('base/agents/a.md'), action: 'created' },
        { file: proj('base/agents/b.md'), action: 'updated' },
        { file: proj('base/agents/c.md'), action: 'skipped', reason: 'content identical (M2)' },
        { file: proj('base/agents/d.md'), action: 'skipped', mutated: true },
        { file: proj('base/agents/e.md'), action: 'skipped', reason: 'content identical (M2)' },
        { file: 'AGENTS.md', action: 'created' },
        { file: '.opencode/agents/zzz.md', action: 'created' }, // вне карты
      ],
      seedOutcomes: [
        { file: 'executor-lead.md', action: 'created', kind: 'seeded' },
        { file: 'worker-implementer.md', action: 'diverged', kind: 'diverged' },
      ],
      removals: [proj('base/agents/g.md')],
    });

    expect(result.summary).toEqual({
      byCode: {
        created: 2, // a.md + AGENTS.md
        updated: 1,
        unchanged: 1,
        'skipped-mutated': 1,
        'deprecated-noted': 1,
        removed: 1,
        seeded: 1,
        diverged: 1,
        conflict: 1, // zzz.md вне карты
      },
      needsDecision: 3, // skipped-mutated + diverged + conflict
      errors: 1, // h.md без исхода
    });
  });

  it('invalid map → честный throw', () => {
    expect(() => verifyAgainstMap({} as UpdateMap, { syncOutcomes: [], seedOutcomes: [], removals: [] })).toThrow(
      /invalid/i
    );
  });
});

describe('protected / kept — вне needs-decision (§4.6, волна 2.20.0)', () => {
  it('файл карты: protected перекрывает ожидание категории, needsDecision=false', () => {
    const r = run(map({ files: [f('base/agents/a.md', 'changed')] }), {
      syncOutcomes: [{ file: proj('base/agents/a.md'), action: 'skipped', protected: true, protect: 'true' }],
    });
    expect(r.items.find((i) => i.target === 'base/agents/a.md')?.code).toBe('protected');
    expect(r.summary.needsDecision).toBe(0);
  });

  it('kept: принятый локальный контент — не needs-decision', () => {
    const r = run(map({ files: [f('base/agents/a.md', 'new')] }), {
      syncOutcomes: [{ file: proj('base/agents/a.md'), action: 'skipped', kept: true }],
    });
    expect(r.items.find((i) => i.target === 'base/agents/a.md')?.code).toBe('kept');
    expect(r.summary.needsDecision).toBe(0);
  });

  it('AGENTS.md: kept — не решение (правило 6.5)', () => {
    const r = run(map(), { syncOutcomes: [{ file: 'AGENTS.md', action: 'skipped', kept: true }] });
    expect(r.items.find((i) => i.kind === 'agents-md')?.code).toBe('kept');
    expect(r.summary.needsDecision).toBe(0);
  });

  it('факт вне карты: protected/kept сохраняют код, дрейф без защиты — conflict', () => {
    const r = run(map(), {
      syncOutcomes: [
        { file: '.opencode/agents/p.md', action: 'skipped', protected: true, protect: '2.19.0' },
        { file: '.opencode/agents/k.md', action: 'skipped', kept: true },
        { file: '.opencode/agents/d.md', action: 'skipped' },
      ],
    });
    expect(r.items.find((i) => i.target === '.opencode/agents/p.md')).toMatchObject({
      code: 'protected',
      needsDecision: false,
    });
    expect(r.items.find((i) => i.target === '.opencode/agents/k.md')).toMatchObject({
      code: 'kept',
      needsDecision: false,
    });
    expect(r.items.find((i) => i.target === '.opencode/agents/d.md')).toMatchObject({
      code: 'conflict',
      needsDecision: true,
    });
    expect(r.summary.needsDecision).toBe(1);
  });

  it('NEEDS_DECISION_CODES не расширялся (§4.6)', () => {
    expect([...NEEDS_DECISION_CODES].sort()).toEqual(['conflict', 'diverged', 'skipped-mutated']);
  });

  // F1-ревью m-4: protect сильнее удаления (REQ-05, §4.3/§4.12).
  it('removed-цель с фактом protected → protected (не error/removed), needsDecision=false', () => {
    const r = run(map({ files: [f('base/agents/gone.md', 'removed')] }), {
      syncOutcomes: [{ file: proj('base/agents/gone.md'), action: 'skipped', protected: true, protect: 'true' }],
    });
    expect(r.items.find((i) => i.target === 'base/agents/gone.md')).toMatchObject({
      code: 'protected',
      needsDecision: false,
    });
    // факт не утёк в хвост «факт без ожидания» (иначе был бы второй conflict)
    expect(r.items.filter((i) => i.target === proj('base/agents/gone.md'))).toEqual([]);
  });

  it('removed-цель без факта удаления — по-прежнему error (fail-safe не ослаблен)', () => {
    const r = run(map({ files: [f('base/agents/gone.md', 'removed')] }));
    expect(r.items.find((i) => i.target === 'base/agents/gone.md')?.code).toBe('error');
  });
});
