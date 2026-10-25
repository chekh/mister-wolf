// tests/unit/adapters/render/opencode-renderer.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  existsSync,
  readdirSync,
  statSync,
  chmodSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { OpencodeBaseSetRenderer } from '../../../../src/adapters/render/opencode/opencode-renderer.js';
import { insertStamp, parseStamp } from '../../../../src/adapters/render/stamp.js';
import { loadSyncState, sha256 } from '../../../../src/adapters/render/sync-state.js';
import { normalizeManaged } from '../../../../src/domain/protect-key.js';

let proj: string;
let base: string;
let harness: string;

const renderer = () => new OpencodeBaseSetRenderer(base, { harnessTemplatesRoot: harness, setVersion: '9.9.9' });

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), 'wolf-render-'));
  base = mkdtempSync(join(tmpdir(), 'wolf-base-'));
  harness = mkdtempSync(join(tmpdir(), 'wolf-h-'));
  mkdirSync(join(base, 'agents'), { recursive: true });
  mkdirSync(join(base, 'commands'), { recursive: true });
  mkdirSync(join(harness, 'plugins'), { recursive: true });
  writeFileSync(
    join(base, 'agents', 'mr-wolf.md'),
    '---\ndescription: d\nmodel: {{model.primary}}\n---\n# {{tool.task}}\n'
  );
  writeFileSync(join(base, 'commands', 'complain.md'), '/complain {{tool.skill}}\n');
  writeFileSync(join(harness, 'plugins', 'wolf-router.ts'), 'export const x = 1;\n');
  writeFileSync(
    join(base, 'AGENTS.md'),
    '<!-- wolf:onboarding v2 -->\n# Wolf\nПротокол: {{tool.skill}}.\n<!-- /wolf:onboarding -->\n'
  );
});

afterEach(() => {
  rmSync(proj, { recursive: true, force: true });
  rmSync(base, { recursive: true, force: true });
  rmSync(harness, { recursive: true, force: true });
});

describe('init', () => {
  it('создаёт из base + harness-плагинов; подстановка; штамп после frontmatter; повтор — skipped', async () => {
    const out = await renderer().renderBaseSet(proj);
    expect(out.filter((o) => o.action === 'created')).toHaveLength(4); // C1: commands + AGENTS.md не теряются
    const agent = readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(agent).toContain('# task');
    expect(agent).toContain('wolf:rendered base=mr-wolf.md');
    const cmd = readFileSync(join(proj, '.opencode/command/complain.md'), 'utf-8');
    expect(cmd).toContain('/complain skill');
    expect(existsSync(join(proj, '.opencode/plugins/wolf-router.ts'))).toBe(true);
    const again = await renderer().renderBaseSet(proj);
    expect(again.every((o) => o.action === 'skipped')).toBe(true);
  });
  it('bake-in: вживлённое лицо присутствует в рендере (§11.4)', async () => {
    const bake = (baseName: string) => (baseName === 'mr-wolf.md' ? 'ЛИЦО: протокол v1' : null);
    await renderer().renderBaseSet(proj, { bake });
    const agent = readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(agent).toContain('ЛИЦО: протокол v1');
    expect(agent).toContain('wolf:face');
  });
});

describe('модели и diff-ветка renderBaseSet (§4.5)', () => {
  it('с models подставляет конкретные id, плейсхолдеров не остаётся', async () => {
    await renderer().renderBaseSet(proj, { models: { primary: 'prov/m1', worker: 'prov/m2' } });
    const agent = readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(agent).toContain('model: prov/m1');
    expect(agent).not.toContain('{{model.');
  });
  it('diff: существует unstamped → skipped (wx-политика), файл не тронут', async () => {
    mkdirSync(join(proj, '.opencode/agents'), { recursive: true });
    writeFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'чужое без штампа\n');
    const out = await renderer().renderBaseSet(proj);
    const o = out.find((x) => x.file === '.opencode/agents/mr-wolf.md');
    expect(o?.action).toBe('skipped');
    expect(o?.reason).toContain('wx');
    expect(readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8')).toBe('чужое без штампа\n');
  });
  it('diff: stamped + иной контент (смена модели) → updated; совпадение → skipped', async () => {
    await renderer().renderBaseSet(proj, { models: { primary: 'p/m1', worker: 'w/m1' } });
    const out2 = await renderer().renderBaseSet(proj, { models: { primary: 'p/m2', worker: 'w/m2' } });
    expect(out2.find((o) => o.file === '.opencode/agents/mr-wolf.md')?.action).toBe('updated');
    expect(readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8')).toContain('model: p/m2');
    const out3 = await renderer().renderBaseSet(proj, { models: { primary: 'p/m2', worker: 'w/m2' } });
    expect(out3.find((o) => o.file === '.opencode/agents/mr-wolf.md')?.action).toBe('skipped');
  });
  it('outcome.file — путь относительно baseDir, не basename (F5)', async () => {
    const out = await renderer().renderBaseSet(proj);
    expect(out.some((o) => o.file === '.opencode/agents/mr-wolf.md')).toBe(true);
    expect(out.some((o) => o.file === '.opencode/command/complain.md')).toBe(true);
    expect(out.some((o) => o.file === '.opencode/plugins/wolf-router.ts')).toBe(true);
    expect(out.some((o) => o.file === 'AGENTS.md')).toBe(true);
    expect(out.every((o) => !o.file.startsWith('/'))).toBe(true);
  });
});

describe('AGENTS.md (§4.2)', () => {
  it('отсутствует → created: цель в корне, штамп + маркер', async () => {
    const out = await renderer().renderBaseSet(proj);
    const o = out.find((x) => x.file === 'AGENTS.md');
    expect(o?.action).toBe('created');
    const cur = readFileSync(join(proj, 'AGENTS.md'), 'utf-8');
    expect(parseStamp(cur)?.base).toBe('AGENTS.md');
    expect(cur).toContain('<!-- wolf:onboarding v2 -->');
    expect(cur).toContain('<!-- /wolf:onboarding -->');
    expect(cur).toContain('# Wolf');
  });
  it('существует без маркера → marker-append: блок в конец, чужой контент цел, без штампа', async () => {
    writeFileSync(join(proj, 'AGENTS.md'), '# Чужой конфиг\nне трогай\n');
    const out = await renderer().renderBaseSet(proj);
    expect(out.find((x) => x.file === 'AGENTS.md')?.action).toBe('appended');
    const cur = readFileSync(join(proj, 'AGENTS.md'), 'utf-8');
    expect(cur.startsWith('# Чужой конфиг\nне трогай\n')).toBe(true);
    expect(cur).toContain('<!-- wolf:onboarding v2 -->');
    expect(cur).toContain('<!-- /wolf:onboarding -->');
    expect(cur.indexOf('# Чужой конфиг')).toBeLessThan(cur.indexOf('<!-- wolf:onboarding v2 -->'));
    expect(parseStamp(cur)).toBeNull();
  });
  it('маркер есть → skipped (повторный init)', async () => {
    await renderer().renderBaseSet(proj);
    const out = await renderer().renderBaseSet(proj);
    const o = out.find((x) => x.file === 'AGENTS.md');
    expect(o?.action).toBe('skipped');
  });
  it('sync обновляет только штампованный цельный файл; append-блок (без штампа) не трогаем', async () => {
    await renderer().renderBaseSet(proj);
    const r2 = new OpencodeBaseSetRenderer(base, { harnessTemplatesRoot: harness, setVersion: '1.0.1' });
    const res = await r2.syncBaseSet(proj);
    expect(res.outcomes.find((o) => o.file === 'AGENTS.md')?.action).toBe('updated');
    expect(parseStamp(readFileSync(join(proj, 'AGENTS.md'), 'utf-8'))?.set).toBe('1.0.1');

    const proj2 = mkdtempSync(join(tmpdir(), 'wolf-render2-'));
    try {
      writeFileSync(join(proj2, 'AGENTS.md'), '# Только чужой\n');
      await renderer().renderBaseSet(proj2); // AGENTS.md → appended (без штампа)
      const before = readFileSync(join(proj2, 'AGENTS.md'), 'utf-8');
      const res2 = await renderer().syncBaseSet(proj2);
      expect(res2.outcomes.find((o) => o.file === 'AGENTS.md')?.action).toBe('skipped');
      expect(readFileSync(join(proj2, 'AGENTS.md'), 'utf-8')).toBe(before);
    } finally {
      rmSync(proj2, { recursive: true, force: true });
    }
  });
});

describe('sync', () => {
  it('штампованный с изменённым контентом → mutated-skip; идентичный → skipped (T010)', async () => {
    const models = { primary: 'p/m1', worker: 'w/m1' };
    await renderer().renderBaseSet(proj, { models });
    const p = join(proj, '.opencode/agents/mr-wolf.md');
    const canon = readFileSync(p, 'utf-8');
    writeFileSync(p, canon.replace('# task', '# task edited'));
    const res = await renderer().syncBaseSet(proj, models);
    const o = res.outcomes.find((x) => x.file.endsWith('mr-wolf.md'));
    expect(o?.action).toBe('skipped'); // T010: локальная правка не затирается
    expect(o?.reason).toContain('mutated');
    expect(readFileSync(p, 'utf-8')).toContain('# task edited');
    writeFileSync(p, canon); // возврат к канону (не мутация)
    const res2 = await renderer().syncBaseSet(proj, models);
    expect(res2.outcomes.find((x) => x.file.endsWith('mr-wolf.md'))?.action).toBe('skipped'); // M2: контент-компаратор
  });
  it('unstamped → conflict (файл не тронут, reason с опциями); orphaned при исчезновении шаблона', async () => {
    await renderer().renderBaseSet(proj);
    writeFileSync(join(proj, '.opencode/agents/rogue.md'), 'no stamp\n');
    writeFileSync(join(base, 'agents', 'rogue.md'), 'tpl\n');
    rmSync(join(harness, 'plugins', 'wolf-router.ts'));
    const { outcomes, orphaned } = await renderer().syncBaseSet(proj);
    const c = outcomes.find((o) => o.file.endsWith('rogue.md'));
    expect(c?.action).toBe('conflict');
    expect(c?.reason).toContain('rename'); // M10: опции разрешения
    expect(readFileSync(join(proj, '.opencode/agents/rogue.md'), 'utf-8')).toBe('no stamp\n');
    expect(orphaned.some((f) => f.includes('wolf-router.ts'))).toBe(true);
  });
});

describe('sync mutated-skip (T010)', () => {
  const AGENT = '.opencode/agents/mr-wolf.md';

  it('created: sync на пустом проекте → created; повтор → skipped (identical)', async () => {
    const res = await renderer().syncBaseSet(proj);
    expect(res.outcomes.find((o) => o.file === AGENT)?.action).toBe('created');
    expect(existsSync(join(proj, '.opencode/wolf-sync-state.json'))).toBe(true);
    const res2 = await renderer().syncBaseSet(proj);
    const o = res2.outcomes.find((x) => x.file === AGENT);
    expect(o?.action).toBe('skipped');
    expect(o?.reason).toContain('identical');
  });

  it('updated: смена шаблона в base → updated новым рендером; повтор → skipped', async () => {
    await renderer().syncBaseSet(proj);
    writeFileSync(
      join(base, 'agents', 'mr-wolf.md'),
      '---\ndescription: d\nmodel: {{model.primary}}\n---\n# NEW CANON\n'
    );
    const res = await renderer().syncBaseSet(proj);
    expect(res.outcomes.find((o) => o.file === AGENT)?.action).toBe('updated');
    expect(readFileSync(join(proj, AGENT), 'utf-8')).toContain('# NEW CANON');
    const res2 = await renderer().syncBaseSet(proj);
    expect(res2.outcomes.find((o) => o.file === AGENT)?.action).toBe('skipped');
  });

  it('mutated-skip: правка штампованного (штамп цел) → skipped + mutated, правка цела; смена шаблона не перебивает', async () => {
    await renderer().syncBaseSet(proj);
    const p = join(proj, AGENT);
    writeFileSync(p, `${readFileSync(p, 'utf-8')}\nLOCAL EDIT\n`);
    const res = await renderer().syncBaseSet(proj);
    const o = res.outcomes.find((x) => x.file === AGENT);
    expect(o?.action).toBe('skipped');
    expect(o?.reason).toContain('mutated');
    expect(readFileSync(p, 'utf-8')).toContain('LOCAL EDIT');
    // даже при изменённом шаблоне (сдвиг канона) мутация важнее — файл не трогаем
    writeFileSync(join(base, 'agents', 'mr-wolf.md'), '---\ndescription: d\n---\n# OTHER CANON\n');
    const res2 = await renderer().syncBaseSet(proj);
    const o2 = res2.outcomes.find((x) => x.file === AGENT);
    expect(o2?.action).toBe('skipped');
    expect(o2?.reason).toContain('mutated');
    expect(readFileSync(p, 'utf-8')).toContain('LOCAL EDIT');
  });

  it('bootstrap: state-файла нет → правка затёрта (старое поведение), state пересоздан', async () => {
    await renderer().syncBaseSet(proj);
    rmSync(join(proj, '.opencode', 'wolf-sync-state.json'));
    const p = join(proj, AGENT);
    writeFileSync(p, `${readFileSync(p, 'utf-8')}\nLOCAL EDIT\n`);
    const res = await renderer().syncBaseSet(proj);
    expect(res.outcomes.find((o) => o.file === AGENT)?.action).toBe('updated');
    expect(readFileSync(p, 'utf-8')).not.toContain('LOCAL EDIT');
    expect(existsSync(join(proj, '.opencode/wolf-sync-state.json'))).toBe(true);
  });

  it('AGENTS.md: правка штампованного → mutated-skip, правка цела', async () => {
    await renderer().renderBaseSet(proj);
    const p = join(proj, 'AGENTS.md');
    writeFileSync(p, `${readFileSync(p, 'utf-8')}\nLOCAL AGENTS EDIT\n`);
    const res = await renderer().syncBaseSet(proj);
    const o = res.outcomes.find((x) => x.file === 'AGENTS.md');
    expect(o?.action).toBe('skipped');
    expect(o?.reason).toContain('mutated');
    expect(readFileSync(p, 'utf-8')).toContain('LOCAL AGENTS EDIT');
  });
});

describe('sync model context (§4.5)', () => {
  it('sync с контекстом моделей: агент рендерится конкретной моделью', async () => {
    const res = await renderer().syncBaseSet(proj, { primary: 'p/m9', worker: 'w/m9' });
    expect(res.outcomes.find((o) => o.file === '.opencode/agents/mr-wolf.md')?.action).toBe('created');
    expect(readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8')).toContain('model: p/m9');
  });
  it('sync без контекста (легаси) и с omit: model:-строка удалена; повтор — skipped', async () => {
    const res = await renderer().syncBaseSet(proj); // undefined → omit
    expect(res.outcomes.find((o) => o.file === '.opencode/agents/mr-wolf.md')?.action).toBe('created');
    const agent = readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(agent).not.toMatch(/^model:/m);
    expect(agent).not.toContain('{{model.');
    const res2 = await renderer().syncBaseSet(proj, 'omit');
    expect(res2.outcomes.find((o) => o.file === '.opencode/agents/mr-wolf.md')?.action).toBe('skipped');
  });
});

// NFR-01 / N01.1 (юнит): все записи sync-пути — tmp+rename (writeFileAtomic);
// сбой посреди прохода не оставляет полу-записей и tmp-остатков.
describe('атомарные записи tmp+rename (N01.1)', () => {
  function tmpFiles(root: string): string[] {
    const acc: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e.endsWith('.tmp')) acc.push(p);
      }
    };
    if (existsSync(root)) walk(root);
    return acc;
  }

  // Root ignores mode bits (0o500 не даёт EACCES) — тест невоспроизводим от
  // root (Docker CI job). Проверка атомарности остаётся на non-root раннерах
  // (ubuntu в Publish workflow) и локальных macOS/Linux прогонах.
  const itIfNotRoot = process.getuid?.() === 0 ? it.skip : it;

  itIfNotRoot(
    'сбой записи (EACCES в точке AGENTS.md) → файлы либо старые, либо новые целиком; tmp-остатков нет; mutated не тронут',
    async () => {
      await renderer().syncBaseSet(proj); // полный набор, set 9.9.9

      // обновления в очереди: агент (успеет до сбоя), command (mutated → skip),
      // AGENTS.md (смена setVersion → упрётся в read-only корень)
      writeFileSync(join(base, 'agents', 'mr-wolf.md'), '---\ndescription: d\n---\n# NEW CANON\n');
      writeFileSync(join(base, 'commands', 'complain.md'), '/complain NEW {{tool.skill}}\n');
      const cmd = join(proj, '.opencode/command/complain.md');
      writeFileSync(cmd, `${readFileSync(cmd, 'utf-8')}\nLOCAL EDIT\n`); // локальная правка
      const agentsMdBefore = readFileSync(join(proj, 'AGENTS.md'), 'utf-8');
      const r2 = new OpencodeBaseSetRenderer(base, { harnessTemplatesRoot: harness, setVersion: '1.0.1' });

      chmodSync(proj, 0o500); // tmp-файл AGENTS.md.<pid>.…tmp в корне невозможен → EACCES до rename
      try {
        await expect(r2.syncBaseSet(proj)).rejects.toThrow();
      } finally {
        chmodSync(proj, 0o700); // cleanup обязателен: иначе rmSync не сможет удалить содержимое
      }

      // обработанное до сбоя — НОВЫЙ рендер целиком (штамп нового set)
      const agent = readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8');
      expect(agent).toContain('# NEW CANON');
      expect(parseStamp(agent)?.set).toBe('1.0.1');
      // точка сбоя — СТАРЫЙ контент целиком, полу-записи нет
      expect(readFileSync(join(proj, 'AGENTS.md'), 'utf-8')).toBe(agentsMdBefore);
      // mutated-файл не перезаписан (T010 важнее сдвига канона)
      expect(readFileSync(cmd, 'utf-8')).toContain('LOCAL EDIT');
      // tmp-остатков нет нигде под proj
      expect(tmpFiles(proj)).toEqual([]);
    }
  );
});

describe('protect, исцеление штампа, kept, take (§4.3)', () => {
  const AGENT = '.opencode/agents/mr-wolf.md';
  const statePath = (): string => join(proj, '.opencode', 'wolf-sync-state.json');
  const stateRaw = (): string => readFileSync(statePath(), 'utf-8');
  const withProtect = (content: string, value: string): string => {
    const i = content.indexOf('\n');
    return `${content.slice(0, i + 1)}protect: ${value}\n${content.slice(i + 1)}`;
  };
  const treeSnapshot = (root: string): Record<string, string> => {
    const out: Record<string, string> = {};
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else out[relative(root, p)] = `${statSync(p).mtimeMs}:${readFileSync(p, 'utf-8')}`;
      }
    };
    walk(root);
    return out;
  };

  it('R02-1: штамп-дрейф → updated + reason; повторный проход — skipped, файл не меняется (NFR-02)', async () => {
    await renderer().syncBaseSet(proj);
    const p = join(proj, AGENT);
    writeFileSync(p, readFileSync(p, 'utf-8').replace('set=9.9.9', 'set=1.0.0'));
    const res = await renderer().syncBaseSet(proj);
    const o = res.outcomes.find((x) => x.file === AGENT);
    expect(o?.action).toBe('updated');
    expect(o?.reason).toContain('stamp drift healed');
    expect(parseStamp(readFileSync(p, 'utf-8'))?.set).toBe('9.9.9');
    const healed = readFileSync(p, 'utf-8');
    const res2 = await renderer().syncBaseSet(proj);
    expect(res2.outcomes.find((x) => x.file === AGENT)?.action).toBe('skipped');
    expect(readFileSync(p, 'utf-8')).toBe(healed);
  });

  it('R02-3: реальная правка + старый штамп → mutated, файл не тронут', async () => {
    await renderer().syncBaseSet(proj);
    const p = join(proj, AGENT);
    writeFileSync(p, readFileSync(p, 'utf-8').replace('set=9.9.9', 'set=1.0.0').replace('# task', '# edited'));
    const res = await renderer().syncBaseSet(proj);
    const o = res.outcomes.find((x) => x.file === AGENT);
    expect(o?.action).toBe('skipped');
    expect(o?.mutated).toBe(true);
    expect(readFileSync(p, 'utf-8')).toContain('# edited');
  });

  it('R02-4: protect + старый штамп → protected, файл и свидетель не менялись (ADR-7)', async () => {
    await renderer().syncBaseSet(proj);
    const p = join(proj, AGENT);
    const local = withProtect(readFileSync(p, 'utf-8').replace('set=9.9.9', 'set=1.0.0'), 'true');
    writeFileSync(p, local);
    const before = stateRaw();
    const res = await renderer().syncBaseSet(proj);
    const o = res.outcomes.find((x) => x.file === AGENT);
    expect(o?.protected).toBe(true);
    expect(o?.protect).toBe('true');
    expect(readFileSync(p, 'utf-8')).toBe(local);
    expect(stateRaw()).toBe(before);
  });

  it('R05-5: добавление, смена и снятие protect не меняют свидетель и не дают mutated', async () => {
    await renderer().syncBaseSet(proj);
    const p = join(proj, AGENT);
    const canon = readFileSync(p, 'utf-8');
    const before = stateRaw();
    for (const value of ['true', '2.19.0']) {
      writeFileSync(p, withProtect(canon, value));
      const o = (await renderer().syncBaseSet(proj)).outcomes.find((x) => x.file === AGENT);
      expect(o?.protected).toBe(true);
      expect(o?.mutated).toBeFalsy();
      expect(stateRaw()).toBe(before);
    }
    writeFileSync(p, canon);
    const o = (await renderer().syncBaseSet(proj)).outcomes.find((x) => x.file === AGENT);
    expect(o?.action).toBe('skipped');
    expect(o?.mutated).toBeFalsy();
    expect(stateRaw()).toBe(before);
  });

  it('kept (6.5): свидетель origin keep → файл не трогаем; правка владельца снова mutated', async () => {
    await renderer().syncBaseSet(proj);
    const p = join(proj, AGENT);
    const local = `${readFileSync(p, 'utf-8')}\nLOCAL ACCEPTED\n`;
    writeFileSync(p, local);
    writeFileSync(
      statePath(),
      `${JSON.stringify(
        { files: { [AGENT]: { hash: sha256(normalizeManaged(local)), origin: 'keep', base: '1.0.0' } } },
        null,
        2
      )}\n`
    );
    const res = await renderer().syncBaseSet(proj);
    const o = res.outcomes.find((x) => x.file === AGENT);
    expect(o?.kept).toBe(true);
    expect(o?.reason).toContain('locally accepted');
    expect(readFileSync(p, 'utf-8')).toBe(local);
    const res2 = await renderer().syncBaseSet(proj);
    expect(res2.outcomes.find((x) => x.file === AGENT)?.kept).toBe(true);
    writeFileSync(p, `${local}EDIT\n`);
    const res3 = await renderer().syncBaseSet(proj);
    const o3 = res3.outcomes.find((x) => x.file === AGENT);
    expect(o3?.action).toBe('skipped');
    expect(o3?.mutated).toBe(true);
  });

  it("take-on-mutated (6'): бэкап до записи, файл = эталон, свидетель render, outcome.backup", async () => {
    await renderer().syncBaseSet(proj);
    const p = join(proj, AGENT);
    const canon = readFileSync(p, 'utf-8');
    const backupCalls: Array<{ rel: string; content: string }> = [];
    writeFileSync(p, `${canon}\nLOCAL EDIT\n`);
    const res = await renderer().syncBaseSet(proj, undefined, {
      takeMutated: {
        backup: async (rel, content) => {
          backupCalls.push({ rel, content });
          return `.wolf/backup/upgrade/2026-10-25/${rel}`;
        },
      },
    });
    const o = res.outcomes.find((x) => x.file === AGENT);
    expect(o?.action).toBe('updated');
    expect(o?.backup).toBe(`.wolf/backup/upgrade/2026-10-25/${AGENT}`);
    expect(backupCalls).toEqual([{ rel: AGENT, content: `${canon}\nLOCAL EDIT\n` }]);
    expect(readFileSync(p, 'utf-8')).toBe(canon);
    const entry = loadSyncState(proj).files[AGENT] as { hash: string; origin: string };
    expect(entry).toMatchObject({ origin: 'render', hash: sha256(canon) });
  });

  it('правило 7: нет записи свидетеля → бэкап локального до перезаписи (NFR-05)', async () => {
    await renderer().syncBaseSet(proj);
    const p = join(proj, AGENT);
    const canon = readFileSync(p, 'utf-8');
    rmSync(statePath());
    writeFileSync(p, `${canon}\nLOCAL WRONG\n`);
    const backupCalls: string[] = [];
    const res = await renderer().syncBaseSet(proj, undefined, {
      takeMutated: {
        backup: async (rel) => {
          backupCalls.push(rel);
          return `.wolf/backup/${rel}`;
        },
      },
    });
    expect(backupCalls).toContain(AGENT);
    expect(res.outcomes.find((x) => x.file === AGENT)?.backup).toBe(`.wolf/backup/${AGENT}`);
    expect(readFileSync(p, 'utf-8')).toBe(canon);
  });

  it('inspect: protect → protected, kept → kept, foreign+protect → protected; ноль записей (NFR-03)', async () => {
    await renderer().syncBaseSet(proj);
    const p = join(proj, AGENT);
    writeFileSync(p, withProtect(readFileSync(p, 'utf-8'), '2.19.0'));
    writeFileSync(join(proj, '.opencode', 'agents', 'custom.md'), '---\nprotect: true\n---\nbody\n');
    const foreign = '.opencode/command/complain.md';
    writeFileSync(join(proj, foreign), '---\nprotect: true\n---\nчужое без штампа\n');
    const keptFile = '.opencode/plugins/wolf-router.ts';
    writeFileSync(join(proj, keptFile), '// wolf:rendered base=wolf-router.ts set=1.0.0\nLOCAL\n');
    writeFileSync(
      statePath(),
      `${JSON.stringify(
        {
          files: {
            [AGENT]: { hash: sha256(normalizeManaged(readFileSync(p, 'utf-8'))), origin: 'render', base: '9.9.9' },
            [keptFile]: {
              hash: sha256(normalizeManaged(readFileSync(join(proj, keptFile), 'utf-8'))),
              origin: 'keep',
              base: '1.0.0',
            },
          },
        },
        null,
        2
      )}\n`
    );
    const before = treeSnapshot(proj);
    const out = await renderer().inspectBaseSet(proj);
    expect(out.find((x) => x.file === AGENT)).toMatchObject({ action: 'protected', protect: '2.19.0' });
    expect(out.find((x) => x.file === keptFile)).toMatchObject({ action: 'kept', keepBase: '1.0.0' });
    expect(out.find((x) => x.file === foreign)).toMatchObject({ action: 'protected' });
    expect(out.find((x) => x.file === '.opencode/agents/custom.md')).toBeUndefined();
    expect(treeSnapshot(proj)).toEqual(before);
  });

  it('inspect: штамп-дрейф → identical, записи нет (правило 5, read-only)', async () => {
    await renderer().syncBaseSet(proj);
    const p = join(proj, AGENT);
    writeFileSync(p, readFileSync(p, 'utf-8').replace('set=9.9.9', 'set=1.0.0'));
    const before = treeSnapshot(proj);
    const out = await renderer().inspectBaseSet(proj);
    expect(out.find((x) => x.file === AGENT)?.action).toBe('identical');
    expect(treeSnapshot(proj)).toEqual(before);
  });

  it('listProtections: реестр карты и вне карты, behind/recognized, AGENTS.md не входит', async () => {
    await renderer().syncBaseSet(proj);
    const p = join(proj, AGENT);
    writeFileSync(p, withProtect(readFileSync(p, 'utf-8'), 'true'));
    mkdirSync(join(proj, '.opencode', 'command'), { recursive: true });
    writeFileSync(join(proj, '.opencode', 'command', 'custom.md'), '---\nprotect: 2.19.0\n---\nbody\n');
    writeFileSync(join(proj, '.opencode', 'command', 'typo.md'), '---\nprotect: yes\n---\nbody\n');
    const list = await renderer().listProtections!(proj, '9.9.9');
    const agent = list.find((e) => e.file === AGENT);
    expect(agent).toMatchObject({ project: proj, value: 'true', recognized: true, behind: false, base: '9.9.9' });
    expect(agent?.stamp).toBe('9.9.9');
    expect(list.find((e) => e.file === '.opencode/command/custom.md')).toMatchObject({
      value: '2.19.0',
      behind: null,
      stamp: null,
    });
    expect(list.find((e) => e.file === '.opencode/command/typo.md')).toMatchObject({
      value: 'yes',
      recognized: false,
    });
    expect(list.some((e) => e.file === 'AGENTS.md')).toBe(false);
  });

  it('listProtections: защищённый файл с дрейфом → behind true', async () => {
    await renderer().syncBaseSet(proj);
    const p = join(proj, AGENT);
    writeFileSync(p, withProtect(readFileSync(p, 'utf-8').replace('# task', '# local'), 'true'));
    const list = await renderer().listProtections!(proj, '9.9.9');
    expect(list.find((e) => e.file === AGENT)?.behind).toBe(true);
  });

  it('renderFreshFile: эталон цели карты, null для файла вне карты', () => {
    expect(renderer().renderFreshFile!(proj, AGENT)).toContain('wolf:rendered base=mr-wolf.md');
    expect(renderer().renderFreshFile!(proj, '.opencode/agents/nope.md')).toBeNull();
  });

  it('renderFreshFile(AGENTS.md): штампованный эталон карты agents_md (T7, §4.8/§4.10)', () => {
    // AGENTS.md — цель карты, но не файл templateFiles: эталон нужен `--show`/`take`
    const fresh = renderer().renderFreshFile!(proj, 'AGENTS.md');
    expect(fresh).toContain('Протокол: skill.'); // подстановка та же, что у прохода
    expect(fresh).toContain('<!-- wolf:onboarding v2 -->');
    expect(parseStamp(fresh!)).toEqual({ base: 'AGENTS.md', set: '9.9.9' });
  });
});

// F1-ревью (волна 2.20.0): M-1 (init на штампованном AGENTS.md 2.19.0),
// m-2 (take/бэкап для whole-file AGENTS.md), m-7 (EOL блока), m-8.1 (kept
// для AGENTS.md), m-5 (исцеление выше keep — фиксация порядка §4.3).
describe('AGENTS.md: миграция 2.19.0, бэкапы, EOL, kept (F1-ревью)', () => {
  const AGENTS = 'AGENTS.md';
  const AGENT = '.opencode/agents/mr-wolf.md';
  const V2_BLOCK = '<!-- wolf:onboarding v2 -->\n# Wolf 2.19\nСтарое правило.\n<!-- /wolf:onboarding -->\n';
  const V3_TEMPLATE =
    '<!-- wolf:onboarding v3 -->\n# Wolf 2.20\nНовое правило про protect.\n<!-- /wolf:onboarding -->\n';
  const agentsPath = (): string => join(proj, AGENTS);
  const statePath = (): string => join(proj, '.opencode', 'wolf-sync-state.json');
  const freshAgents = (template: string): string => insertStamp(template, { base: AGENTS, set: '9.9.9' }, AGENTS);
  const seedWitness = (files: Record<string, unknown>): void => {
    mkdirSync(join(proj, '.opencode'), { recursive: true });
    writeFileSync(statePath(), `${JSON.stringify({ files }, null, 2)}\n`);
  };

  it('M-1: init на штампованном 2.19.0 с блоком v2 → эталон + свидетель; повтор — no-op; sync/inspect — identical', async () => {
    writeFileSync(join(base, 'AGENTS.md'), V3_TEMPLATE);
    const old = insertStamp(V2_BLOCK, { base: AGENTS, set: '2.19.0' }, AGENTS);
    writeFileSync(agentsPath(), old);
    seedWitness({ [AGENTS]: { hash: sha256(normalizeManaged(old)), origin: 'render', base: '2.19.0' } });

    const out = await renderer().renderBaseSet(proj);
    expect(out.find((o) => o.file === AGENTS)?.action).toBe('updated');

    const after = readFileSync(agentsPath(), 'utf-8');
    expect(after).toBe(freshAgents(V3_TEMPLATE));
    expect(parseStamp(after)?.set).toBe('9.9.9');
    expect(loadSyncState(proj).files[AGENTS]).toEqual({
      hash: sha256(normalizeManaged(after)),
      origin: 'render',
      base: '9.9.9',
    });

    // повторный init — no-op (NFR-02)
    const again = await renderer().renderBaseSet(proj);
    expect(again.find((o) => o.file === AGENTS)?.action).toBe('skipped');
    expect(readFileSync(agentsPath(), 'utf-8')).toBe(after);

    // следующий проход — консистентен: не mutated (NFR-02)
    const res = await renderer().syncBaseSet(proj);
    expect(res.outcomes.find((o) => o.file === AGENTS)?.mutated).toBeFalsy();
    expect(res.outcomes.find((o) => o.file === AGENTS)?.action).toBe('skipped');
    expect(readFileSync(agentsPath(), 'utf-8')).toBe(after);

    // --check: не решение (REQ-03 AC4)
    expect((await renderer().inspectBaseSet(proj)).find((o) => o.file === AGENTS)?.action).toBe('identical');
  });

  it('rr-1: штамп приводится на своём месте — `---` frontmatter остаётся первой строкой', async () => {
    writeFileSync(join(base, 'AGENTS.md'), V3_TEMPLATE);
    const front = '---\ndescription: my agents\n---\n';
    const old = insertStamp(front + V2_BLOCK, { base: AGENTS, set: '2.19.0' }, AGENTS);
    writeFileSync(agentsPath(), old);
    expect(parseStamp(old)?.set).toBe('2.19.0');
    expect(old.startsWith(front)).toBe(true); // insertStamp: штамп после frontmatter

    await renderer().renderBaseSet(proj);
    const after = readFileSync(agentsPath(), 'utf-8');
    expect(after.startsWith(front)).toBe(true); // frontmatter не сдвинут
    expect(after).toContain('<!-- wolf:onboarding v3 -->');
    expect(parseStamp(after)?.set).toBe('9.9.9');
    expect(after.split('\n').filter((l) => l.includes('wolf:rendered'))).toHaveLength(1);
  });

  it('M-1 heal: блок уже v3, штамп старый (след предыдущего init) → штамп приведён, свидетель записан', async () => {
    writeFileSync(join(base, 'AGENTS.md'), V3_TEMPLATE);
    const stale = insertStamp(V3_TEMPLATE, { base: AGENTS, set: '2.19.0' }, AGENTS);
    writeFileSync(agentsPath(), stale);
    seedWitness({ [AGENTS]: { hash: sha256(normalizeManaged(stale)), origin: 'render', base: '2.19.0' } });

    const out = await renderer().renderBaseSet(proj);
    expect(out.find((o) => o.file === AGENTS)?.action).toBe('updated');
    const after = readFileSync(agentsPath(), 'utf-8');
    expect(after).toBe(freshAgents(V3_TEMPLATE));
    expect(loadSyncState(proj).files[AGENTS]).toMatchObject({ base: '9.9.9' });
    expect((await renderer().syncBaseSet(proj)).outcomes.find((o) => o.file === AGENTS)?.mutated).toBeFalsy();
  });

  it('M-1 guard: локальный текст вне блока → блок/штамп обновлены, свидетель не переписан → mutated, текст цел', async () => {
    writeFileSync(join(base, 'AGENTS.md'), V3_TEMPLATE);
    const old = insertStamp(`${V2_BLOCK}\nMY LOCAL RULES\n`, { base: AGENTS, set: '2.19.0' }, AGENTS);
    writeFileSync(agentsPath(), old);
    seedWitness({ [AGENTS]: { hash: sha256(normalizeManaged(old)), origin: 'render', base: '2.19.0' } });

    const out = await renderer().renderBaseSet(proj);
    expect(out.find((o) => o.file === AGENTS)?.action).toBe('updated');
    const after = readFileSync(agentsPath(), 'utf-8');
    expect(after).toContain('MY LOCAL RULES');
    expect(parseStamp(after)?.set).toBe('9.9.9');
    // свидетель остался старым: локальный текст не выдаётся за эталон
    expect(loadSyncState(proj).files[AGENTS]).toMatchObject({ base: '2.19.0' });

    const res = await renderer().syncBaseSet(proj);
    const o = res.outcomes.find((x) => x.file === AGENTS);
    expect(o?.action).toBe('skipped');
    expect(o?.mutated).toBe(true);
    expect(readFileSync(agentsPath(), 'utf-8')).toContain('MY LOCAL RULES');
  });

  it('m-7: CRLF-файл — блок получает EOL файла, текст выше/ниже байт-в-байт, повтор — skipped', async () => {
    const above = '# Мой текст\r\n\r\n';
    const below = '\r\nхвост\r\n';
    writeFileSync(
      agentsPath(),
      `${above}<!-- wolf:onboarding v2 -->\r\nстарое содержимое\r\n<!-- /wolf:onboarding -->${below}`
    );

    const out = await renderer().renderBaseSet(proj);
    expect(out.find((o) => o.file === AGENTS)?.action).toBe('updated');
    const after = readFileSync(agentsPath(), 'utf-8');
    expect(after.startsWith(above)).toBe(true);
    expect(after.endsWith(below)).toBe(true);
    // ни одного LF без CR: блок не смешивает EOL с файлом
    expect(after.replace(/\r\n/g, '')).not.toContain('\n');
    expect(after).not.toContain('старое содержимое');

    const again = await renderer().renderBaseSet(proj);
    expect(again.find((o) => o.file === AGENTS)?.action).toBe('skipped');
    expect(readFileSync(agentsPath(), 'utf-8')).toBe(after);
  });

  it('m-8.1: kept для AGENTS.md — sync skipped+kept, inspect kept+keepBase, файл цел (6.5)', async () => {
    await renderer().renderBaseSet(proj);
    const local = `${readFileSync(agentsPath(), 'utf-8')}\nMY LOCAL\n`;
    writeFileSync(agentsPath(), local);
    seedWitness({ [AGENTS]: { hash: sha256(normalizeManaged(local)), origin: 'keep', base: '1.0.0' } });

    const res = await renderer().syncBaseSet(proj);
    const o = res.outcomes.find((x) => x.file === AGENTS);
    expect(o?.kept).toBe(true);
    expect(o?.reason).toContain('locally accepted');
    expect(readFileSync(agentsPath(), 'utf-8')).toBe(local);

    const insp = (await renderer().inspectBaseSet(proj)).find((x) => x.file === AGENTS);
    expect(insp).toMatchObject({ action: 'kept', kept: true, keepBase: '1.0.0' });
  });

  it('m-5: исцеление выше keep — отличие только в штампе при origin keep → healed, свидетель render', async () => {
    await renderer().syncBaseSet(proj);
    const p = join(proj, AGENT);
    const canon = readFileSync(p, 'utf-8');
    writeFileSync(p, canon.replace('set=9.9.9', 'set=9.9.8'));
    seedWitness({ [AGENT]: { hash: sha256(normalizeManaged(canon)), origin: 'keep', base: '1.0.0' } });

    const res = await renderer().syncBaseSet(proj);
    const o = res.outcomes.find((x) => x.file === AGENT);
    expect(o?.action).toBe('updated');
    expect(o?.reason).toContain('stamp drift healed');
    expect(readFileSync(p, 'utf-8')).toBe(canon);
    expect(loadSyncState(proj).files[AGENT]).toEqual({
      hash: sha256(normalizeManaged(canon)),
      origin: 'render',
      base: '9.9.9',
    });
  });

  it('m-2: take-on-mutated для AGENTS.md — бэкап до записи, файл = эталон, свидетель render', async () => {
    await renderer().renderBaseSet(proj);
    const canon = readFileSync(agentsPath(), 'utf-8');
    const local = `${canon}\nLOCAL AGENTS EDIT\n`;
    writeFileSync(agentsPath(), local);
    const calls: Array<{ rel: string; content: string }> = [];

    const res = await renderer().syncBaseSet(proj, undefined, {
      takeMutated: {
        backup: async (rel, content) => {
          calls.push({ rel, content });
          // порядок §4.12: на диске ещё локальная версия — бэкап раньше записи
          expect(readFileSync(join(proj, rel), 'utf-8')).toBe(content);
          return `.wolf/backup/upgrade/2026-10-25/${rel}`;
        },
      },
    });
    const o = res.outcomes.find((x) => x.file === AGENTS);
    expect(o?.action).toBe('updated');
    expect(o?.backup).toBe(`.wolf/backup/upgrade/2026-10-25/${AGENTS}`);
    expect(calls).toEqual([{ rel: AGENTS, content: local }]);
    expect(readFileSync(agentsPath(), 'utf-8')).toBe(canon);
    expect(loadSyncState(proj).files[AGENTS]).toMatchObject({ origin: 'render', hash: sha256(canon) });
  });

  it('m-2 без хука: mutated AGENTS.md остаётся skipped+mutated, файл цел', async () => {
    await renderer().renderBaseSet(proj);
    const local = `${readFileSync(agentsPath(), 'utf-8')}\nLOCAL AGENTS EDIT\n`;
    writeFileSync(agentsPath(), local);
    const o = (await renderer().syncBaseSet(proj)).outcomes.find((x) => x.file === AGENTS);
    expect(o?.action).toBe('skipped');
    expect(o?.mutated).toBe(true);
    expect(readFileSync(agentsPath(), 'utf-8')).toBe(local);
  });

  it('m-2 правило 7: свидетеля AGENTS.md нет → бэкап локального до перезаписи (NFR-05)', async () => {
    await renderer().renderBaseSet(proj);
    const canon = readFileSync(agentsPath(), 'utf-8');
    rmSync(statePath());
    writeFileSync(agentsPath(), `${canon}\nLOCAL WRONG\n`);
    const calls: string[] = [];

    const res = await renderer().syncBaseSet(proj, undefined, {
      takeMutated: {
        backup: async (rel) => {
          calls.push(rel);
          return `.wolf/backup/${rel}`;
        },
      },
    });
    expect(calls).toContain(AGENTS);
    expect(res.outcomes.find((x) => x.file === AGENTS)).toMatchObject({
      action: 'updated',
      backup: `.wolf/backup/${AGENTS}`,
    });
    expect(readFileSync(agentsPath(), 'utf-8')).toBe(canon);
  });
});
