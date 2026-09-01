// src/adapters/render/opencode/opencode-renderer.ts
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, join, relative } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { BaseSetRenderer, BakeResolver, RenderOutcome } from '../../../ports/base-set-renderer.port.js';
import { OPENCODE_MANIFEST, substitute } from '../manifest.js';
import { insertStamp, parseStamp } from '../stamp.js';
import { wolfVersion } from '../templates-root.js';

const NEUTRAL_DIRS = ['agents', 'skills', 'commands'] as const;
const LAYOUT: Record<(typeof NEUTRAL_DIRS)[number], string> = {
  agents: '.opencode/agents',
  skills: '.opencode/skills',
  commands: '.opencode/command',
};

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

  async renderBaseSet(baseDir: string, bake?: BakeResolver): Promise<RenderOutcome[]> {
    const outcomes: RenderOutcome[] = [];
    for (const f of this.templateFiles(baseDir)) {
      if (existsSync(f.target)) {
        outcomes.push({ file: f.baseName, action: 'skipped', reason: 'exists (wx-политика)' });
        continue;
      }
      await this.writeRendered(f, bake);
      outcomes.push({ file: f.baseName, action: 'created' });
    }
    return outcomes;
  }

  async syncBaseSet(baseDir: string): Promise<{ outcomes: RenderOutcome[]; orphaned: string[] }> {
    const outcomes: RenderOutcome[] = [];
    const seen = new Set<string>();
    for (const f of this.templateFiles(baseDir)) {
      seen.add(f.target);
      if (!existsSync(f.target)) {
        await this.writeRendered(f);
        outcomes.push({ file: f.baseName, action: 'created' });
        continue;
      }
      const current = readFileSync(f.target, 'utf-8');
      if (parseStamp(current) === null) {
        outcomes.push({
          file: f.baseName,
          action: 'conflict',
          reason: 'unstamped на месте шаблонного — владелец решает: переименовать / удалить / принять текущий',
        });
        continue;
      }
      const fresh = this.renderContent(f);
      if (fresh === current) {
        outcomes.push({ file: f.baseName, action: 'skipped', reason: 'content identical (M2)' });
        continue;
      }
      await mkdir(join(f.target, '..'), { recursive: true });
      await writeFile(f.target, fresh, 'utf-8');
      outcomes.push({ file: f.baseName, action: 'updated' });
    }
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

  private renderContent(f: TemplateFile, bake?: BakeResolver): string {
    let rendered = substitute(readFileSync(f.tplPath, 'utf-8'), OPENCODE_MANIFEST);
    const body = bake?.(f.baseName);
    if (body) {
      rendered += `\n<!-- wolf:face baked (bake-in, §4) -->\n${body}\n`;
    }
    return insertStamp(rendered, { base: f.baseName, set: this.setVersion }, f.baseName);
  }

  private async writeRendered(f: TemplateFile, bake?: BakeResolver): Promise<void> {
    await mkdir(join(f.target, '..'), { recursive: true });
    await writeFile(f.target, this.renderContent(f, bake), 'utf-8');
  }
}
