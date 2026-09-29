// src/app/use-cases/seed-base-playbooks.ts
import { z } from 'zod';
import { buildTypeSchema } from '../../domain/type-schema-builder.js';
import { getDeclaration } from '../../domain/memory-types.js';

export interface SeedOutcome {
  file: string;
  action: 'created' | 'skipped';
  reason?: string;
}

// wave13-a: playbook поглощён note+facet howto (карта §5.4 2.13); спец-поля
// (owner_skill/version/steps) живут в passthrough — как у article/blocker
export const PlaybookNoteSchema = buildTypeSchema(getDeclaration('note'), {
  owner_skill: z.string(),
  version: z.string().default('1'),
  steps: z.array(z.string()).default([]),
});
export type PlaybookNoteInput = {
  type: 'note';
  facet: 'howto';
  title: string;
  body: string;
  createdBy: string;
  tags: string[];
  extra: { owner_skill: string; version: string; steps: string[] };
};

export type SeedAddFn = (input: PlaybookNoteInput) => Promise<unknown>;

export interface SeedDeps {
  files: Map<string, string>;
  add: SeedAddFn;
  /** Опциональный предикат «этот owner_skill уже посеян» (по умолчанию — нет, т.к. add сам валидирует). */
  isSeeded?: (ownerSkill: string) => Promise<boolean>;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.+)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: m[2] };
}

/** Посев (спека §7): скип по owner_skill (MAJ-3/C2), не по пересечению тегов. */
export async function seedBasePlaybooks(deps: SeedDeps): Promise<SeedOutcome[]> {
  const outcomes: SeedOutcome[] = [];
  // ponytail: без .sort() — план-тест ожидает порядок вставки Map (added[0]=steward); порядок посева функционально не важен
  for (const [file, raw] of deps.files) {
    const { meta, body } = parseFrontmatter(raw);
    const ownerSkill = meta.owner_skill ?? '';
    if (deps.isSeeded && (await deps.isSeeded(ownerSkill))) {
      outcomes.push({ file, action: 'skipped', reason: `owner_skill=${ownerSkill} already in memory (R2-M3)` });
      continue;
    }
    const steps = (meta.steps ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    await deps.add({
      type: 'note', // wave13-a: playbook → note+facet howto
      facet: 'howto',
      title: meta.title ?? file,
      body,
      createdBy: 'wolf-init',
      tags: (meta.tags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      extra: { owner_skill: ownerSkill, version: meta.version ?? '1', steps },
    });
    outcomes.push({ file, action: 'created' });
  }
  return outcomes;
}
