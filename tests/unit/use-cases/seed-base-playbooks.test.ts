// tests/unit/use-cases/seed-base-playbooks.test.ts
import { describe, expect, it } from 'vitest';
import { seedBasePlaybooks, SeedAddFn } from '../../../src/app/use-cases/seed-base-playbooks.js';

const FILE_A =
  '---\ntitle: Наставник v1\nowner_skill: steward\nversion: 1\nsteps: читай жалобу | мутируй playbook | supersede\ntags: steward:наставник,playbook\n---\nПротокол мутации.';
const FILE_B =
  '---\ntitle: Жалобный протокол\nowner_skill: mr-wolf\nversion: 1\nsteps: зафиксируй трение | вызови Стюарда\ntags: complaint,playbook\n---\nПравило жалобы.';

describe('seedBasePlaybooks', () => {
  it('сеет через addMemoryObject с extra-полями; повтор — скип по owner_skill (C2)', async () => {
    const added: any[] = [];
    const add: SeedAddFn = async (input) => {
      added.push(input);
      return { object: { id: `m${added.length}` } as any, warnings: [] };
    };
    const files = new Map<string, string>([
      ['steward-nastavnik.md', FILE_A],
      ['complaint-protocol.md', FILE_B],
    ]);
    const out1 = await seedBasePlaybooks({ files, add });
    expect(out1.map((o) => o.action)).toEqual(['created', 'created']); // C2: не 1/6, все
    expect(added[0].createdBy).toBe('wolf-init');
    expect(added[0].extra).toMatchObject({ owner_skill: 'steward', version: '1' });
    expect(Array.isArray(added[0].extra.steps)).toBe(true);
    const out2 = await seedBasePlaybooks({ files, add });
    expect(out2.every((o) => o.action === 'skipped')).toBe(true); // R2-M3: tag-skip не по пересечению тегов
    expect(added).toHaveLength(2); // ничего не досеяно
  });
  it('новый owner_skill сеется при частично заполненной памяти', async () => {
    const added: any[] = [];
    const add: SeedAddFn = async (input) => {
      added.push(input);
      return { object: {} as any, warnings: [] };
    };
    const files = new Map<string, string>([
      ['steward-nastavnik.md', FILE_A],
      ['complaint-protocol.md', FILE_B],
    ]);
    // первый вызов: add отказывается сеять FILE_A (симуляция «уже есть» — эмулируем фильтром known)
    const known = new Set(['steward']);
    const filter = async (ownerSkill: string) => known.has(ownerSkill);
    await seedBasePlaybooks({ files, add, isSeeded: filter });
    expect(added.map((a) => a.extra.owner_skill)).toEqual(['mr-wolf']);
  });
});
