// src/adapters/render/opencode/opencode-renderer.ts
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, join, relative } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import {
  BaseSetRenderer,
  BakeResolver,
  ModelContext,
  RenderBaseSetOptions,
  RenderOutcome,
} from '../../../ports/base-set-renderer.port.js';
import { OPENCODE_MANIFEST, substitute } from '../manifest.js';
import { insertStamp, parseStamp } from '../stamp.js';
import { wolfVersion } from '../templates-root.js';

const NEUTRAL_DIRS = ['agents', 'skills', 'commands'] as const;
const LAYOUT: Record<(typeof NEUTRAL_DIRS)[number], string> = {
  agents: '.opencode/agents',
  skills: '.opencode/skills',
  commands: '.opencode/command',
};

/** Маркер онбординг-блока в AGENTS.md (спека §4.2). */
const ONBOARDING_MARKER = '<!-- wolf:onboarding v2 -->';

interface TemplateFile {
  tplPath: string;
  /** Цель посчитана в templateFiles: корень зависит от происхождения шаблона (NC1). */
  target: string;
  baseName: string;
}

export class OpencodeBaseSetRenderer implements BaseSetRenderer {
  id = 'opencode';

  constructor(
    private readonly baseTemplatesRoot: string,
    private readonly opts: { harnessTemplatesRoot?: string; setVersion?: string } = {}
  ) {}

  private get setVersion(): string {
    return this.opts.setVersion ?? wolfVersion();
  }

  /** NC1: harness-шаблоны резолвятся от СВОЕГО корня, не от baseTemplatesRoot. */
  private *templateFiles(baseDir: string): Generator<TemplateFile> {
    for (const dir of NEUTRAL_DIRS) {
      const root = join(this.baseTemplatesRoot, dir);
      for (const p of this.walkAbs(root)) {
        yield { tplPath: p, target: join(baseDir, LAYOUT[dir], relative(root, p)), baseName: basename(p) };
      }
    }
    const pluginsRoot = this.opts.harnessTemplatesRoot ? join(this.opts.harnessTemplatesRoot, 'plugins') : null;
    if (pluginsRoot && existsSync(pluginsRoot)) {
      for (const p of this.walkAbs(pluginsRoot)) {
        yield {
          tplPath: p,
          target: join(baseDir, '.opencode/plugins', relative(pluginsRoot, p)),
          baseName: basename(p),
        };
      }
    }
  }

  private *walkAbs(dir: string): Generator<string> {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) yield* this.walkAbs(p);
      else yield p;
    }
  }

  async renderBaseSet(baseDir: string, opts?: RenderBaseSetOptions): Promise<RenderOutcome[]> {
    const outcomes: RenderOutcome[] = [];
    for (const f of this.templateFiles(baseDir)) {
      const rel = relative(baseDir, f.target);
      if (existsSync(f.target)) {
        // diff-ветка (§4.5): unstamped — чужое (wx); stamped — сравнение контента
        const current = readFileSync(f.target, 'utf-8');
        if (parseStamp(current) === null) {
          outcomes.push({ file: rel, action: 'skipped', reason: 'exists, unstamped (wx policy)' });
          continue;
        }
        const fresh = this.renderContent(f, opts?.bake, opts?.models);
        if (fresh === current) {
          outcomes.push({ file: rel, action: 'skipped', reason: 'content identical' });
        } else {
          await writeFile(f.target, fresh, 'utf-8');
          outcomes.push({ file: rel, action: 'updated', reason: 'content differs (diff branch, §4.5)' });
        }
        continue;
      }
      await this.writeRendered(f, opts?.bake, opts?.models);
      outcomes.push({ file: rel, action: 'created' });
    }
    outcomes.push(...(await this.renderAgentsMd(baseDir, opts?.models)));
    return outcomes;
  }

  async syncBaseSet(
    baseDir: string,
    models?: ModelContext | 'omit'
  ): Promise<{ outcomes: RenderOutcome[]; orphaned: string[] }> {
    const ctx = models ?? 'omit'; // легаси без routing-объекта — omit (§4.5)
    const outcomes: RenderOutcome[] = [];
    const seen = new Set<string>();
    for (const f of this.templateFiles(baseDir)) {
      seen.add(f.target);
      const rel = relative(baseDir, f.target);
      if (!existsSync(f.target)) {
        await this.writeRendered(f, undefined, ctx);
        outcomes.push({ file: rel, action: 'created' });
        continue;
      }
      const current = readFileSync(f.target, 'utf-8');
      if (parseStamp(current) === null) {
        outcomes.push({
          file: rel,
          action: 'conflict',
          reason: 'unstamped in place of a template one — the owner decides: rename / delete / accept the current one',
        });
        continue;
      }
      const fresh = this.renderContent(f, undefined, ctx);
      if (fresh === current) {
        outcomes.push({ file: rel, action: 'skipped', reason: 'content identical (M2)' });
        continue;
      }
      await mkdir(join(f.target, '..'), { recursive: true });
      await writeFile(f.target, fresh, 'utf-8');
      outcomes.push({ file: rel, action: 'updated' });
    }
    outcomes.push(...(await this.syncAgentsMd(baseDir, ctx)));
    const orphaned: string[] = [];
    const scanRoots = [
      join(baseDir, '.opencode/agents'),
      join(baseDir, '.opencode/skills'),
      join(baseDir, '.opencode/command'),
      join(baseDir, '.opencode/plugins'),
    ];
    for (const root of scanRoots) {
      if (!existsSync(root)) continue;
      for (const f of this.walkAbs(root)) {
        if (!seen.has(f) && parseStamp(readFileSync(f, 'utf-8')) !== null) orphaned.push(relative(baseDir, f));
      }
    }
    return { outcomes, orphaned };
  }

  /** AGENTS.md — цель в КОРНЕ проекта (§4.2); шаблона нет — тихо нет исхода. */
  private agentsMdPaths(baseDir: string): { tplPath: string; target: string } | null {
    const tplPath = join(this.baseTemplatesRoot, 'AGENTS.md');
    if (!existsSync(tplPath)) return null;
    return { tplPath, target: join(baseDir, 'AGENTS.md') };
  }

  private agentsMdContent(tplPath: string, models?: ModelContext | 'omit'): string {
    const raw = readFileSync(tplPath, 'utf-8');
    return substitute(raw, OPENCODE_MANIFEST, models);
  }

  /** Init-ветка AGENTS.md: create (wx + штамп) / marker-append / skip (D3). */
  private async renderAgentsMd(baseDir: string, models?: ModelContext): Promise<RenderOutcome[]> {
    const paths = this.agentsMdPaths(baseDir);
    if (!paths) return [];
    const content = this.agentsMdContent(paths.tplPath, models);
    if (!existsSync(paths.target)) {
      await writeFile(
        paths.target,
        insertStamp(content, { base: 'AGENTS.md', set: this.setVersion }, 'AGENTS.md'),
        'utf-8'
      );
      return [{ file: 'AGENTS.md', action: 'created' }];
    }
    const current = readFileSync(paths.target, 'utf-8');
    if (current.includes(ONBOARDING_MARKER)) {
      return [{ file: 'AGENTS.md', action: 'skipped', reason: 'onboarding marker exists (§4.2)' }];
    }
    // marker-append: маркированный блок без штампа в конец; чужой контент не трогаем
    const block = content.endsWith('\n') ? content : `${content}\n`;
    const sep = current.endsWith('\n') ? (current.endsWith('\n\n') ? '' : '\n') : '\n\n';
    await writeFile(paths.target, `${current}${sep}${block}`, 'utf-8');
    return [{ file: 'AGENTS.md', action: 'appended', reason: 'marker-append (D3: foreign content untouched)' }];
  }

  /** Sync-ветка AGENTS.md: только штампованный цельный файл; append-блок синку не принадлежит. */
  private async syncAgentsMd(baseDir: string, models?: ModelContext | 'omit'): Promise<RenderOutcome[]> {
    const paths = this.agentsMdPaths(baseDir);
    if (!paths) return [];
    const fresh = insertStamp(
      this.agentsMdContent(paths.tplPath, models),
      { base: 'AGENTS.md', set: this.setVersion },
      'AGENTS.md'
    );
    if (!existsSync(paths.target)) {
      await writeFile(paths.target, fresh, 'utf-8');
      return [{ file: 'AGENTS.md', action: 'created' }];
    }
    const current = readFileSync(paths.target, 'utf-8');
    if (parseStamp(current) === null) {
      return [
        { file: 'AGENTS.md', action: 'skipped', reason: 'no stamp (append block) — does not belong to sync (§4.2)' },
      ];
    }
    if (fresh === current) {
      return [{ file: 'AGENTS.md', action: 'skipped', reason: 'content identical (M2)' }];
    }
    await writeFile(paths.target, fresh, 'utf-8');
    return [{ file: 'AGENTS.md', action: 'updated' }];
  }

  private renderContent(f: TemplateFile, bake?: BakeResolver, models?: ModelContext | 'omit'): string {
    let rendered = substitute(readFileSync(f.tplPath, 'utf-8'), OPENCODE_MANIFEST, models);
    const body = bake?.(f.baseName);
    if (body) {
      rendered += `\n<!-- wolf:face baked (bake-in, §4) -->\n${body}\n`;
    }
    return insertStamp(rendered, { base: f.baseName, set: this.setVersion }, f.baseName);
  }

  private async writeRendered(f: TemplateFile, bake?: BakeResolver, models?: ModelContext | 'omit'): Promise<void> {
    await mkdir(join(f.target, '..'), { recursive: true });
    await writeFile(f.target, this.renderContent(f, bake, models), 'utf-8');
  }
}
