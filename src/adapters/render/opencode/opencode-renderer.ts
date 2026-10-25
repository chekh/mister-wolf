// src/adapters/render/opencode/opencode-renderer.ts
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, join, relative } from 'path';
import { mkdir } from 'fs/promises';
import { writeFileAtomic } from '../../fs/markdown-memory-store.js';
import {
  BackupHook,
  BaseSetRenderer,
  BakeResolver,
  InspectOutcome,
  ModelContext,
  ProtectEntry,
  RenderBaseSetOptions,
  RenderOutcome,
  SyncBaseSetOptions,
} from '../../../ports/base-set-renderer.port.js';
import { OPENCODE_MANIFEST, substitute } from '../manifest.js';
import { insertStamp, parseStamp, renderStamp, stripStampLines } from '../stamp.js';
import { loadSyncState, saveSyncState, sha256, type SyncEntry, type SyncState } from '../sync-state.js';
import { normalizeManaged, parseProtect, type ProtectValue } from '../../../domain/protect-key.js';
import { wolfVersion } from '../templates-root.js';

const NEUTRAL_DIRS = ['agents', 'skills', 'commands'] as const;
const LAYOUT: Record<(typeof NEUTRAL_DIRS)[number], string> = {
  agents: '.opencode/agents',
  skills: '.opencode/skills',
  commands: '.opencode/command',
};

/** Детект онбординг-блока версионно-агностичен (§4.5): литерал `vN` в коде
 *  запрещён, иначе после смены версии шаблона существующий блок не распознаётся
 *  и init/append допишет второй. Версия формата — только в шаблоне (ADR-3). */
const ONBOARDING_OPEN = /^<!-- wolf:onboarding v(\d+) -->$/;
const ONBOARDING_CLOSE = /^<!-- \/wolf:onboarding -->$/;

interface OnboardingBlock {
  version: number;
  /** Смещение начала строки открывающего маркера. */
  start: number;
  /** Смещение конца строки закрывающего маркера (без перевода строки). */
  end: number;
}

/** Блок между маркерами: null — блока нет, 'broken' — открывающий без закрывающего. */
function findOnboardingBlock(content: string): OnboardingBlock | 'broken' | null {
  let offset = 0;
  let start = -1;
  let end = -1;
  let version = 0;
  for (const line of content.split('\n')) {
    const text = line.replace(/\r$/, '');
    if (start === -1) {
      const m = text.match(ONBOARDING_OPEN);
      if (m) {
        start = offset;
        version = Number(m[1]);
      }
    } else if (end === -1 && ONBOARDING_CLOSE.test(text)) {
      end = offset + line.length;
    }
    offset += line.length + 1;
  }
  if (start === -1) return null;
  return end === -1 ? 'broken' : { version, start, end };
}

/** Блок шаблона: единственный источник версии формата и текста обновления. */
function templateBlock(template: string): { version: number; text: string } | null {
  const block = findOnboardingBlock(template);
  if (block === null || block === 'broken') return null;
  return { version: block.version, text: template.slice(block.start, block.end) };
}

/** EOL файла по первой строке: блок получает EOL файла, а не шаблона (m-7). */
function fileEol(content: string): '\n' | '\r\n' {
  const nl = content.indexOf('\n');
  return nl > 0 && content[nl - 1] === '\r' ? '\r\n' : '\n';
}

const MUTATED_REASON = 'mutated after render — differs from recorded render and fresh render; left untouched';

interface TemplateFile {
  tplPath: string;
  /** Цель посчитана в templateFiles: корень зависит от происхождения шаблона (NC1). */
  target: string;
  baseName: string;
}

/** Решающее состояние цели base-set — единый порядок правил §4.3 во всех трёх режимах. */
type TargetState = 'missing' | 'protected' | 'unstamped' | 'identical' | 'heal' | 'mutated' | 'kept' | 'rewrite';

interface TargetDecision {
  state: TargetState;
  fresh: string;
  current?: string;
  protect?: ProtectValue;
  entry?: SyncEntry;
}

/** Легаси-строка свидетеля → запись (loadSyncState уже нормализует; защита для типов). */
const asEntry = (v: string | SyncEntry | undefined): SyncEntry | undefined =>
  v === undefined ? undefined : typeof v === 'string' ? { hash: v, origin: 'render', base: '0.0.0' } : v;

/** Значение ключа для дайджеста: `true` | `X.Y.Z` | raw вне грамматики. */
const protectValue = (p: ProtectValue): string => p.value ?? p.raw ?? '';

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
    // WP1 (спека 2.16 §4): минимальный init — только AGENTS.md (create wx / marker-append / skip)
    if (opts?.scope === 'agents-md') {
      const state = loadSyncState(baseDir);
      const outcomes = await this.renderAgentsMd(baseDir, opts.models, state);
      saveSyncState(baseDir, state);
      return outcomes;
    }
    const outcomes: RenderOutcome[] = [];
    const state = loadSyncState(baseDir);
    for (const f of this.templateFiles(baseDir)) {
      const rel = relative(baseDir, f.target);
      const fresh = this.renderContent(f, opts?.bake, opts?.models);
      const d = this.classify(rel, f.target, fresh, state);
      switch (d.state) {
        case 'missing':
          await this.writeFresh(f.target, fresh);
          this.record(state, rel, fresh);
          outcomes.push({ file: rel, action: 'created' });
          break;
        case 'protected':
          outcomes.push({ file: rel, action: 'skipped', protected: true, protect: protectValue(d.protect!) });
          break;
        case 'unstamped':
          // diff-ветка (§4.5): unstamped — чужое (wx)
          outcomes.push({ file: rel, action: 'skipped', reason: 'exists, unstamped (wx policy)' });
          break;
        case 'identical':
          this.record(state, rel, fresh);
          outcomes.push({ file: rel, action: 'skipped', reason: 'content identical' });
          break;
        case 'heal':
          await this.writeFresh(f.target, fresh);
          this.record(state, rel, fresh);
          outcomes.push({ file: rel, action: 'updated', reason: `stamp drift healed (base ${this.setVersion})` });
          break;
        case 'mutated':
          // K6 (спека 2.16 §4): локальная правка штампованного файла не перебивается
          // re-init — тот же mutated-skip, что в syncBaseSet (T010); blind reseed запрещён
          outcomes.push({ file: rel, action: 'skipped', mutated: true, reason: MUTATED_REASON });
          break;
        case 'kept':
          outcomes.push({
            file: rel,
            action: 'skipped',
            kept: true,
            reason: `locally accepted (keep) at ${d.entry!.base}`,
          });
          break;
        case 'rewrite':
          await this.writeFresh(f.target, fresh);
          this.record(state, rel, fresh);
          outcomes.push({ file: rel, action: 'updated', reason: 'content differs (diff branch, §4.5)' });
          break;
      }
    }
    outcomes.push(...(await this.renderAgentsMd(baseDir, opts?.models, state)));
    saveSyncState(baseDir, state);
    return outcomes;
  }

  async syncBaseSet(
    baseDir: string,
    models?: ModelContext | 'omit',
    opts?: SyncBaseSetOptions
  ): Promise<{ outcomes: RenderOutcome[]; orphaned: string[] }> {
    const ctx = models ?? 'omit'; // легаси без routing-объекта — omit (§4.5)
    const backup: BackupHook | undefined = opts?.takeMutated?.backup;
    const outcomes: RenderOutcome[] = [];
    const seen = new Set<string>();
    const state = loadSyncState(baseDir);
    for (const f of this.templateFiles(baseDir)) {
      seen.add(f.target);
      const rel = relative(baseDir, f.target);
      const fresh = this.renderContent(f, undefined, ctx);
      const d = this.classify(rel, f.target, fresh, state);
      switch (d.state) {
        case 'missing':
          await this.writeFresh(f.target, fresh);
          this.record(state, rel, fresh);
          outcomes.push({ file: rel, action: 'created' });
          break;
        case 'protected':
          outcomes.push({
            file: rel,
            action: 'skipped',
            protected: true,
            protect: protectValue(d.protect!),
            reason: d.protect!.unrecognized
              ? 'held by protect (unrecognized value — treated as protected)'
              : 'held by protect',
          });
          break;
        case 'unstamped':
          outcomes.push({
            file: rel,
            action: 'conflict',
            reason:
              'unstamped in place of a template one — the owner decides: rename / delete / accept the current one',
          });
          break;
        case 'identical':
          this.record(state, rel, fresh);
          outcomes.push({ file: rel, action: 'skipped', reason: 'content identical (M2)' });
          break;
        case 'heal':
          await this.writeFresh(f.target, fresh);
          this.record(state, rel, fresh);
          outcomes.push({ file: rel, action: 'updated', reason: `stamp drift healed (base ${this.setVersion})` });
          break;
        case 'mutated': {
          if (!backup) {
            outcomes.push({ file: rel, action: 'skipped', mutated: true, reason: MUTATED_REASON });
            break;
          }
          // Правило 6′ §4.3/§4.12: бэкап → эталон → свидетель (порядок обязателен, NFR-05)
          const backupPath = await backup(rel, d.current!);
          await this.writeFresh(f.target, fresh);
          this.record(state, rel, fresh);
          outcomes.push({
            file: rel,
            action: 'updated',
            backup: backupPath,
            reason: 'take-on-mutated (--yes): local copy saved',
          });
          break;
        }
        case 'kept': {
          const base = d.entry!.base;
          outcomes.push({
            file: rel,
            action: 'skipped',
            kept: true,
            reason: `locally accepted (keep) at ${base}${base !== this.setVersion ? `, base ${this.setVersion}` : ''}`,
          });
          break;
        }
        case 'rewrite': {
          // Правило 7: записи свидетеля нет — локальный контент сначала в бэкап (NFR-05).
          const backupPath = !d.entry && backup ? await backup(rel, d.current!) : undefined;
          await this.writeFresh(f.target, fresh);
          this.record(state, rel, fresh);
          outcomes.push({ file: rel, action: 'updated', ...(backupPath ? { backup: backupPath } : {}) });
          break;
        }
      }
    }
    outcomes.push(...(await this.syncAgentsMd(baseDir, ctx, state, backup)));
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
    saveSyncState(baseDir, state);
    return { outcomes, orphaned };
  }

  /** Блочный режим AGENTS.md (§4.5): управляется только текст между маркерами;
   *  контент выше и ниже — байт-в-байт. protect у AGENTS.md не поддерживается.
   *  Штампованная цель с блоком (миграция 2.19.0 → 2.20.0, M-1) после замены
   *  блока получает штамп текущей базы и свидетель; `state` передаёт только
   *  init-ветка (блочный файл без штампа свидетеля не имеет). */
  private async syncAgentsBlock(
    target: string,
    current: string,
    template: string,
    state?: SyncState
  ): Promise<RenderOutcome> {
    const block = findOnboardingBlock(current);
    if (block === null) {
      return {
        file: 'AGENTS.md',
        action: 'skipped',
        reason: 'no onboarding block — left untouched (wx policy)',
      };
    }
    const tpl = templateBlock(template);
    if (block === 'broken' || tpl === null) {
      return {
        file: 'AGENTS.md',
        action: 'skipped',
        reason: 'onboarding markers broken — file treated as foreign (wx policy)',
      };
    }
    // [start,end) включает завершающий `\r` закрывающего маркера: подстановка
    // в CRLF-файл кончается им же, иначе после маркера остаётся LF (m-7).
    const eol = fileEol(current);
    const text = eol === '\r\n' ? `${tpl.text.replace(/\n/g, '\r\n')}\r` : tpl.text;
    const replaced = `${current.slice(0, block.start)}${text}${current.slice(block.end)}`;
    const updated = this.restampAgents(replaced);
    if (updated === current) {
      return { file: 'AGENTS.md', action: 'skipped', reason: 'content identical (onboarding block)' };
    }
    await this.writeFresh(target, updated);
    if (state) this.recordAgentsBase(state, updated, template);
    const blockChanged = current.slice(block.start, block.end) !== text;
    return {
      file: 'AGENTS.md',
      action: 'updated',
      reason: blockChanged
        ? `onboarding block ${block.version} → ${tpl.version}`
        : `stamp drift healed (base ${this.setVersion})`,
    };
  }

  /** Штампованная цель с блоком: штамп приводится к текущей базе. Без нового
   *  регекса штампа (§4.4) — strip + render; EOL файла сохраняется. */
  private restampAgents(content: string): string {
    const stamp = parseStamp(content);
    if (stamp === null || stamp.set === this.setVersion) return content;
    const line = renderStamp({ base: 'AGENTS.md', set: this.setVersion }, 'AGENTS.md');
    return `${line}${fileEol(content)}${stripStampLines(content)}`;
  }

  /** Свидетель после обновления блока: только если файл совпал с эталоном
   *  (EOL отличием не считается — проход приводит его правилом 7). Иначе
   *  локальный текст вне блока остаётся решением `mutated` и не перезаписывается. */
  private recordAgentsBase(state: SyncState, written: string, template: string): void {
    const fresh = insertStamp(template, { base: 'AGENTS.md', set: this.setVersion }, 'AGENTS.md');
    if (written === fresh || written.replace(/\r\n/g, '\n') === fresh) this.record(state, 'AGENTS.md', written);
  }

  /** T10 (REQ-08): read-only инспекция целей base-set — предикат того, что
   *  сделает syncBaseSet, БЕЗ записей (ни writeFileAtomic, ни saveSyncState):
   *  missing / protected / foreign (unstamped, wx-политика) / identical (в т.ч.
   *  штамп-дрейф: проходу нечего решать) / differs / mutated / kept. models по
   *  умолчанию 'omit' — паритет с syncBaseSet, чей исход и предсказываем. */
  async inspectBaseSet(baseDir: string, opts?: RenderBaseSetOptions): Promise<InspectOutcome[]> {
    const ctx = opts?.models ?? 'omit'; // легаси без routing-объекта — omit (§4.5)
    const state = loadSyncState(baseDir);
    const outcomes: InspectOutcome[] = [];
    for (const f of this.templateFiles(baseDir)) {
      const rel = relative(baseDir, f.target);
      const fresh = this.renderContent(f, opts?.bake, ctx);
      const d = this.classify(rel, f.target, fresh, state);
      switch (d.state) {
        case 'missing':
          outcomes.push({ file: rel, action: 'missing' });
          break;
        case 'protected':
          outcomes.push({
            file: rel,
            action: 'protected',
            protected: true,
            protect: protectValue(d.protect!),
            detail: d.protect!.unrecognized ? 'protect value is not recognized — treated as protected' : undefined,
          });
          break;
        case 'unstamped':
          outcomes.push({ file: rel, action: 'foreign' });
          break;
        case 'identical':
        case 'heal':
          outcomes.push({ file: rel, action: 'identical' });
          break;
        case 'mutated':
          outcomes.push({ file: rel, action: 'mutated' });
          break;
        case 'kept':
          outcomes.push({ file: rel, action: 'kept', kept: true, keepBase: d.entry!.base });
          break;
        case 'rewrite':
          outcomes.push({ file: rel, action: 'differs' });
          break;
      }
    }
    const agents = this.inspectAgentsMd(baseDir, ctx, state);
    if (agents) outcomes.push(agents);
    return outcomes;
  }

  /** Реестр защит (§4.11, REQ-09): read-only обход каталогов base-set, включая
   *  файлы вне карты. AGENTS.md в реестр не входит — protect у него не поддерживается. */
  async listProtections(baseDir: string, base: string): Promise<ProtectEntry[]> {
    const entries: ProtectEntry[] = [];
    const roots = [
      join(baseDir, '.opencode/agents'),
      join(baseDir, '.opencode/skills'),
      join(baseDir, '.opencode/command'),
      join(baseDir, '.opencode/plugins'),
    ];
    for (const root of roots) {
      if (!existsSync(root)) continue;
      for (const abs of this.walkAbs(root)) {
        const current = readFileSync(abs, 'utf-8');
        const protect = parseProtect(current);
        if (!protect.held) continue;
        const rel = relative(baseDir, abs);
        const fresh = this.renderFreshFile(baseDir, rel);
        entries.push({
          project: baseDir,
          file: rel,
          value: protectValue(protect),
          recognized: !protect.unrecognized,
          stamp: parseStamp(current)?.set ?? null,
          base,
          behind: fresh === null ? null : normalizeManaged(current) !== fresh,
        });
      }
    }
    return entries.sort((a, b) => a.file.localeCompare(b.file));
  }

  /** Свежий рендер одного файла карты (эталон для `--show` и `behind`); null — вне карты. */
  renderFreshFile(baseDir: string, rel: string, opts?: RenderBaseSetOptions): string | null {
    for (const f of this.templateFiles(baseDir)) {
      if (relative(baseDir, f.target) === rel) return this.renderContent(f, opts?.bake, opts?.models ?? 'omit');
    }
    return null;
  }

  /** Read-only инспекция AGENTS.md (§4.2) — по фактическим веткам управления:
   *  штампованный цельный файл — зона syncAgentsMd (сверка всего файла со
   *  штампом, mutated по свидетелю); без штампа — маркер-блок append-ветки
   *  init (синку не принадлежит, свидетеля не имеет); нет ни штампа, ни
   *  маркера — чужой файл на месте цели (wx-политика → foreign). */
  private inspectAgentsMd(baseDir: string, models: ModelContext | 'omit', state: SyncState): InspectOutcome | null {
    const paths = this.agentsMdPaths(baseDir);
    if (!paths) return null;
    if (!existsSync(paths.target)) return { file: 'AGENTS.md', action: 'missing' };
    const current = readFileSync(paths.target, 'utf-8');
    const content = this.agentsMdContent(paths.tplPath, models);
    if (parseStamp(current) !== null) {
      const fresh = insertStamp(content, { base: 'AGENTS.md', set: this.setVersion }, 'AGENTS.md');
      if (fresh === current) return { file: 'AGENTS.md', action: 'identical' };
      const entry = asEntry(state.files['AGENTS.md']);
      const hash = sha256(normalizeManaged(current));
      if (entry && entry.hash !== hash) return { file: 'AGENTS.md', action: 'mutated' };
      if (entry && entry.origin === 'keep')
        return { file: 'AGENTS.md', action: 'kept', kept: true, keepBase: entry.base };
      return { file: 'AGENTS.md', action: 'differs' };
    }
    const block = findOnboardingBlock(current);
    if (block === null) return { file: 'AGENTS.md', action: 'foreign' };
    if (block === 'broken') {
      return { file: 'AGENTS.md', action: 'foreign', detail: 'onboarding markers broken' };
    }
    const tpl = templateBlock(content);
    if (tpl === null) return { file: 'AGENTS.md', action: 'unknown' };
    const same = block.version >= tpl.version && current.slice(block.start, block.end) === tpl.text;
    return { file: 'AGENTS.md', action: same ? 'identical' : 'differs' };
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
  private async renderAgentsMd(
    baseDir: string,
    models: ModelContext | 'omit' | undefined,
    state: SyncState
  ): Promise<RenderOutcome[]> {
    const paths = this.agentsMdPaths(baseDir);
    if (!paths) return [];
    const content = this.agentsMdContent(paths.tplPath, models);
    if (!existsSync(paths.target)) {
      const written = insertStamp(content, { base: 'AGENTS.md', set: this.setVersion }, 'AGENTS.md');
      await this.writeFresh(paths.target, written);
      this.record(state, 'AGENTS.md', written);
      return [{ file: 'AGENTS.md', action: 'created' }];
    }
    const current = readFileSync(paths.target, 'utf-8');
    if (findOnboardingBlock(current) === 'broken') {
      return [
        {
          file: 'AGENTS.md',
          action: 'skipped',
          reason: 'onboarding markers broken — file treated as foreign (wx policy)',
        },
      ];
    }
    if (findOnboardingBlock(current) !== null) {
      // блок уже есть: и init обновляет его по версии формата (§4.5), а не «вечно пропускает»
      return [await this.syncAgentsBlock(paths.target, current, content, state)];
    }
    // marker-append: маркированный блок без штампа в конец; чужой контент не трогаем
    const block = content.endsWith('\n') ? content : `${content}\n`;
    const sep = current.endsWith('\n') ? (current.endsWith('\n\n') ? '' : '\n') : '\n\n';
    await this.writeFresh(paths.target, `${current}${sep}${block}`);
    return [{ file: 'AGENTS.md', action: 'appended', reason: 'marker-append (D3: foreign content untouched)' }];
  }

  /** Sync-ветка AGENTS.md: только штампованный цельный файл; append-блок синку не принадлежит.
   *  protect у AGENTS.md не поддерживается (§4.5); правила 6/6.5/7 §4.3 действуют,
   *  включая take-on-mutated (6′) с бэкапом — механизм тот же, что у файлов карты (§4.12). */
  private async syncAgentsMd(
    baseDir: string,
    models: ModelContext | 'omit',
    state: SyncState,
    backup?: BackupHook
  ): Promise<RenderOutcome[]> {
    const paths = this.agentsMdPaths(baseDir);
    if (!paths) return [];
    const fresh = insertStamp(
      this.agentsMdContent(paths.tplPath, models),
      { base: 'AGENTS.md', set: this.setVersion },
      'AGENTS.md'
    );
    if (!existsSync(paths.target)) {
      await this.writeFresh(paths.target, fresh);
      this.record(state, 'AGENTS.md', fresh);
      return [{ file: 'AGENTS.md', action: 'created' }];
    }
    const current = readFileSync(paths.target, 'utf-8');
    if (parseStamp(current) === null) {
      // Блочный режим (§4.5): управляется только блок между маркерами; append-ветка —
      // исключительно init (решение L0 2026-10-25), upgrade чужой файл не дописывает.
      return [await this.syncAgentsBlock(paths.target, current, this.agentsMdContent(paths.tplPath, models))];
    }
    if (fresh === current) {
      this.record(state, 'AGENTS.md', fresh);
      return [{ file: 'AGENTS.md', action: 'skipped', reason: 'content identical (M2)' }];
    }
    const entry = asEntry(state.files['AGENTS.md']);
    const hash = sha256(normalizeManaged(current));
    if (entry && entry.hash !== hash) {
      if (!backup) return [{ file: 'AGENTS.md', action: 'skipped', mutated: true, reason: MUTATED_REASON }];
      // Правило 6′ §4.3/§4.12: бэкап → эталон → свидетель (порядок обязателен, NFR-05)
      const backupPath = await backup('AGENTS.md', current);
      await this.writeFresh(paths.target, fresh);
      this.record(state, 'AGENTS.md', fresh);
      return [
        {
          file: 'AGENTS.md',
          action: 'updated',
          backup: backupPath,
          reason: 'take-on-mutated (--yes): local copy saved',
        },
      ];
    }
    if (entry && entry.origin === 'keep') {
      return [
        {
          file: 'AGENTS.md',
          action: 'skipped',
          kept: true,
          reason: `locally accepted (keep) at ${entry.base}${entry.base !== this.setVersion ? `, base ${this.setVersion}` : ''}`,
        },
      ];
    }
    // Правило 7: записи свидетеля нет — локальный контент сначала в бэкап (NFR-05).
    const backupPath = !entry && backup ? await backup('AGENTS.md', current) : undefined;
    await this.writeFresh(paths.target, fresh);
    this.record(state, 'AGENTS.md', fresh);
    return [{ file: 'AGENTS.md', action: 'updated', ...(backupPath ? { backup: backupPath } : {}) }];
  }

  /** Единый порядок решающих правил §4.3: missing → protect → unstamped →
   *  identical → штамп-дрейф → mutated → kept → rewrite. Режимы (sync/render/
   *  inspect) читают это решение и выполняют свою часть (запись или нет). */
  private classify(rel: string, target: string, fresh: string, state: SyncState): TargetDecision {
    if (!existsSync(target)) return { state: 'missing', fresh };
    const current = readFileSync(target, 'utf-8');
    const protect = parseProtect(current);
    if (protect.held) return { state: 'protected', fresh, current, protect };
    if (parseStamp(current) === null) return { state: 'unstamped', fresh, current };
    const normalized = normalizeManaged(current);
    if (normalized === fresh) return { state: 'identical', fresh, current };
    if (stripStampLines(normalized) === stripStampLines(fresh)) return { state: 'heal', fresh, current };
    const entry = asEntry(state.files[rel]);
    if (entry && sha256(normalized) !== entry.hash) return { state: 'mutated', fresh, current, entry };
    if (entry && entry.origin === 'keep') return { state: 'kept', fresh, current, entry };
    return { state: 'rewrite', fresh, current, entry };
  }

  /** Свидетель записи: хэш нормализованного контента + происхождение + база (§4.2). */
  private record(state: SyncState, rel: string, written: string): void {
    state.files[rel] = { hash: sha256(normalizeManaged(written)), origin: 'render', base: this.setVersion };
  }

  private async writeFresh(target: string, content: string): Promise<void> {
    await mkdir(join(target, '..'), { recursive: true });
    await writeFileAtomic(target, content);
  }

  private renderContent(f: TemplateFile, bake?: BakeResolver, models?: ModelContext | 'omit'): string {
    let rendered = substitute(readFileSync(f.tplPath, 'utf-8'), OPENCODE_MANIFEST, models);
    const body = bake?.(f.baseName);
    if (body) {
      rendered += `\n<!-- wolf:face baked (bake-in, §4) -->\n${body}\n`;
    }
    return insertStamp(rendered, { base: f.baseName, set: this.setVersion }, f.baseName);
  }
}
