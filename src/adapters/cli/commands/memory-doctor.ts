import { Command } from 'commander';
import { join, relative, sep, dirname } from 'path';
import { existsSync, readdirSync, realpathSync, readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { runDoctor } from '../../../app/use-cases/doctor.js';
import { incompleteFaceOperations } from '../../../app/use-cases/face-operation.js';
import { runArtifactLint } from '../../../app/use-cases/lint-artifacts.js';
import { detectPlatformMismatch } from '../../../app/use-cases/platform-mismatch.js';
import { repairPlatform } from '../../../app/use-cases/repair-platform.js';
import { syncBaseSet } from '../../../app/use-cases/sync-base-set.js';
import { ProjectsRegistry } from '../../../adapters/fs/projects-registry.js';
import { wolfUserConfigDir } from '../../../adapters/fs/user-config.js';
import { readSchemaVersion } from '../../../adapters/fs/schema-version.js';
import { artifactFs } from '../../../adapters/fs/artifact-fs.js';
import { templatesRoot, harnessTemplatesRoot } from '../../../adapters/render/templates-root.js';
import { OpencodeBaseSetRenderer } from '../../../adapters/render/opencode/opencode-renderer.js';
import { PLATFORM_ADAPTERS, CANONICAL_MCP_COMMAND } from '../../../adapters/platforms/index.js';
import type { PlatformAdapter } from '../../../ports/platform-adapter.port.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { worktreeScopeToken } from '../../../adapters/fs/memory-root.js';
import { safeCwd } from '../cli-entry.js';
import { repairStorage } from '../../../app/use-cases/repair-storage.js';
import { eventsPath, memoryDir, sharedDir } from '../../../adapters/fs/project-paths.js';
import { maskSecrets } from '../../../domain/mask-secrets.js';
import { UserFacingError } from '../../../domain/errors.js';
import type { MemoryObject } from '../../../domain/schemas/memory-object-schema.js';

/**
 * Песочницы (спека 2.14 §8.2): записи под os.tmpdir() чистим с пометкой sandbox.
 * macOS-нюанс: os.tmpdir() возвращает `/var/folders/…`, а пути в реестре часто
 * `/private/var/folders/…` (realpath) — сравниваем с обоими написаними + `/tmp`
 * (и его realpath) для явных tmp-песочниц.
 */
function isSandboxPath(p: string): boolean {
  const roots = new Set<string>();
  for (const r of [tmpdir(), '/tmp']) {
    roots.add(r);
    try {
      roots.add(realpathSync(r));
    } catch {
      // корня нет — пропускаем
    }
  }
  for (const r of roots) {
    if (p === r || p.startsWith(r + sep)) return true;
  }
  return false;
}

async function readFileOrNull(p: string): Promise<string | null> {
  try {
    return await readFile(p, 'utf-8');
  } catch {
    return null;
  }
}

function readFileSyncOrNull(p: string): string | null {
  try {
    return readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

function loadSyncStateFiles(baseDir: string): Record<string, string> | null {
  const raw = readFileSyncOrNull(join(baseDir, '.opencode', 'wolf-sync-state.json'));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { files?: Record<string, string> };
    return parsed.files && typeof parsed.files === 'object' ? parsed.files : null;
  } catch {
    return null;
  }
}

/** 2.16.2 (REQ-02): строки несоответствия «установлено под v1, рантайм v2» для runDoctor. */
export function makeDetectMismatch(adapters: PlatformAdapter[]): (path: string) => Promise<string[]> {
  return async (path: string): Promise<string[]> => {
    const issues: string[] = [];
    for (const adapter of adapters) {
      if (adapter.id !== 'opencode' || !adapter.detectVersion || !adapter.detect(path)) continue;
      const runtime = await adapter.detectVersion(path);
      const found = await detectPlatformMismatch({
        baseDir: path,
        runtime: () => runtime,
        readSyncState: () => {
          const files = loadSyncStateFiles(path);
          return files ? { files } : null;
        },
        readFile: readFileSyncOrNull,
      });
      if (found) issues.push(found.issue);
    }
    return issues;
  };
}

/** Волна 2.17 NFR-02 (design §Проверка целостности): находка гигиены лиц. */
export interface FaceLintFinding {
  file: string;
  issue: string;
}

function ownerSkillOf(o: MemoryObject): string | null {
  const v = (o as { owner_skill?: unknown }).owner_skill;
  return typeof v === 'string' && v !== '' ? v : null;
}

/**
 * Волна 2.17 NFR-02: гигиена канонических лиц за один проход по store.list
 * (без вложенных полных проходов): (а) >1 активной face одного owner_skill;
 * (в) based_on указывает на несуществующий id; (г) активная legacy-playbook
 * (note + facet howto + owner_skill) рядом с активной face того же владельца.
 * (б) face вне контракта — файлы shared/faces/, отбракованные парсером store
 * (faceProblems): в list() они молча выпадают, поэтому идут отдельным входом.
 * Активная face = status 'active' (та же семантика, что у activeFace в
 * create-face-version.ts); superseded/archived legacy гасят проверку (г).
 */
export function lintFaces(objects: MemoryObject[], faceProblems: { path: string; error: string }[]): FaceLintFinding[] {
  const findings: FaceLintFinding[] = [];
  const faceIds = new Set<string>();
  const activeFaces: { id: string; owner: string }[] = [];
  for (const o of objects) {
    if (o.type !== 'face') continue;
    faceIds.add(o.id);
    const owner = ownerSkillOf(o);
    if (o.status === 'active' && owner !== null) activeFaces.push({ id: o.id, owner });
  }
  const activeByOwner = new Map<string, number>();
  for (const f of activeFaces) activeByOwner.set(f.owner, (activeByOwner.get(f.owner) ?? 0) + 1);
  for (const f of activeFaces) {
    const n = activeByOwner.get(f.owner) ?? 0;
    if (n > 1) {
      findings.push({
        file: f.id,
        issue: `duplicate canonical face for ${f.owner} (${n} active — exactly one allowed)`,
      });
    }
  }
  for (const o of objects) {
    if (o.type !== 'face') continue;
    const based = (o as { based_on?: unknown }).based_on;
    if (typeof based === 'string' && based !== '' && !faceIds.has(based)) {
      findings.push({ file: o.id, issue: `based_on ${based} does not exist` });
    }
  }
  const activeFaceOwners = new Set(activeFaces.map((f) => f.owner));
  for (const o of objects) {
    if (o.type !== 'note' || (o as { facet?: unknown }).facet !== 'howto') continue;
    const owner = ownerSkillOf(o);
    if (owner === null || o.status === 'superseded' || o.status === 'archived') continue;
    if (activeFaceOwners.has(owner)) {
      findings.push({
        file: o.id,
        issue: `active legacy playbook for ${owner} alongside a face — run wolf face migrate / supersede the legacy note`,
      });
    }
  }
  for (const p of faceProblems) {
    findings.push({ file: p.path, issue: `face does not match its contract: ${p.error}` });
  }
  return findings;
}

export function memoryDoctorCommand(): Command {
  return new Command('doctor')
    .description('Check all registered projects: binary vs schema version, platform configs, prune dead entries')
    .option('--repair', 'repair storage in the current project: rebuild index, backfill memory.added events', false)
    .option('--dry-run', 'with --repair: print the plan without writing', false)
    .action(async (options: { repair?: boolean; dryRun?: boolean }) => {
      if (options.dryRun && !options.repair) {
        throw new UserFacingError('--dry-run is used with --repair: wolf doctor --repair --dry-run');
      }
      if (options.repair) {
        const cwd = safeCwd();
        const { store, log, clock, idGen, index, lock, memoryRoot } = createCliContainer(cwd);
        const events = eventsPath(memoryRoot);
        // 2.16.2 (REQ-02, ADR-3): платформенная зона ремонта до storage-зоны, общий отчёт.
        const oc = PLATFORM_ADAPTERS.find((a) => a.id === 'opencode');
        let platformReport: Awaited<ReturnType<typeof repairPlatform>> | null = null;
        if (oc) {
          platformReport = await repairPlatform(
            {
              baseDir: cwd,
              detect: () => oc.detect(cwd),
              syncStateFiles: () => loadSyncStateFiles(cwd),
              readFile: readFileSyncOrNull,
              listFiles: (root) => {
                if (!existsSync(root)) return [];
                const out: string[] = [];
                const walk = (d: string) => {
                  for (const e of readdirSync(d, { withFileTypes: true })) {
                    const p = join(d, e.name);
                    if (e.isDirectory()) walk(p);
                    else out.push(p);
                  }
                };
                walk(root);
                return out;
              },
              mismatch: () => makeDetectMismatch([oc])(cwd),
              syncBaseSet: () =>
                syncBaseSet(
                  new OpencodeBaseSetRenderer(templatesRoot(), {
                    harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
                  }),
                  cwd
                ),
              writeConfig: () => oc.writeConfig(cwd, CANONICAL_MCP_COMMAND),
            },
            { dryRun: options.dryRun === true }
          );
        }
        const report = await repairStorage(
          {
            store,
            log,
            clock,
            idGen,
            index,
            lock,
            readEventLines: async () => {
              try {
                return (await readFile(events, 'utf-8')).split('\n').filter((l) => l.trim() !== '');
              } catch {
                return [];
              }
            },
          },
          { dryRun: options.dryRun === true }
        );
        console.log(`# wolf doctor --repair${options.dryRun ? ' (dry-run)' : ''}`);
        if (platformReport) {
          if (platformReport.skipped) {
            console.log(`## Platform: skipped — ${platformReport.skipped}`);
          } else if (options.dryRun) {
            console.log('## Platform (plan)');
            for (const p of platformReport.plan) console.log(`- ${p}`);
          } else {
            console.log('## Platform');
            for (const a of platformReport.actions) console.log(`- ${a}`);
            for (const m of platformReport.plan.filter((p) => p.startsWith('mismatch: '))) {
              console.log(`  ! ${m.slice('mismatch: '.length)}`);
            }
            if (platformReport.orphanedNote) console.log(`  ! ${platformReport.orphanedNote}`);
          }
        }
        console.log('## Storage');
        for (const a of report.actions) console.log(`- ${a}`);
        console.log(
          `reindexed: ${report.reindexed}, events backfilled: ${report.eventsAppended}, dangling events: ${report.danglingEvents}`
        );
        return;
      }
      const registry = new ProjectsRegistry(wolfUserConfigDir());
      const report = await runDoctor({
        registry,
        readSchema: (p) => readSchemaVersion(p),
        exists: async (p) => existsSync(p),
        adapters: PLATFORM_ADAPTERS,
        cwd: safeCwd(),
        isSandbox: isSandboxPath,
        readFile: readFileOrNull,
        detectMismatch: makeDetectMismatch(PLATFORM_ADAPTERS),
      });

      console.log(`# wolf doctor — binary schema v${report.binarySchemaVersion}`);
      console.log(`registry: ${join(wolfUserConfigDir(), 'projects.yaml')}`);
      console.log();
      if (report.entries.length === 0) {
        console.log('No registered projects. Run `wolf init` inside a project.');
        return;
      }
      for (const e of report.entries) {
        if (e.status === 'sandbox') {
          console.log(`- ${e.path}: sandbox — pruned (os tmpdir)`);
          continue;
        }
        const schema = e.schemaVersion === null ? '-' : `v${e.schemaVersion}`;
        let hint = '';
        if (e.status === 'outdated-binary') hint = ' — update wolf: npm install -g mister-wolf';
        if (e.status === 'outdated-project') hint = ' — run any wolf command inside the project (lazy migration)';
        if (e.status === 'not-initialized') hint = ' — not initialized: run wolf init inside the project';
        if (e.status === 'missing') hint = ' — pruned (path no longer exists)';
        console.log(`- ${e.path}: ${e.status} (schema ${schema})${hint}`);
        for (const issue of e.issues) {
          console.log(`  ! ${maskSecrets(issue)}`);
        }
      }
      if (report.pruned.length > 0) {
        console.log();
        console.log(`Pruned ${report.pruned.length} dead entr${report.pruned.length === 1 ? 'y' : 'ies'}.`);
      }

      const cwd = safeCwd();
      // Контейнер общий для артефакт- и осиротевшей-секций (WP3 §6.2):
      // store + memoryRoot (поле из задачи 4), resolveMemoryRoot тут не нужен.
      const { store, log, memoryRoot } = createCliContainer(cwd);
      if (existsSync(join(cwd, 'docs', 'dev'))) {
        const toolOwners = new Set<string>();
        for (const t of await store.list({ type: 'tool' })) {
          // archived-тулы не гасят призрака: гасят только живые регистрации (контракт e2e intake)
          if (t.status === 'archived') continue;
          const owner = (t as { owner_skill?: string }).owner_skill;
          if (typeof owner === 'string' && owner !== '') toolOwners.add(owner);
        }
        const baseSkillsDir = join(templatesRoot(), 'skills');
        const baseSkillNames = new Set(existsSync(baseSkillsDir) ? readdirSync(baseSkillsDir) : []);
        const findings = await runArtifactLint({
          fs: artifactFs(),
          baseDir: cwd,
          toolOwners,
          baseSkillNames,
        });
        if (findings.length > 0) {
          console.log();
          console.log('## Artifacts (docs/dev)');
          for (const f of findings) console.log(`! ${f.file}: ${maskSecrets(f.message)}`);
        }
      }

      // WP3 §6.2: осиротевшие worktree-scope — находка; очистка вручную (promote/edit), P3.
      // F-02 (ревью фазы 4): WT-ID-токены (w-<sha1(realpath)[:12]>, 2.17.1 REQ-02)
      // никогда не совпадают с именами каталогов .git/worktrees — живость такого
      // токена сверяется с токенами живых копий (gitdir-файлы записей, тот же
      // fs-контракт, что в memory-root.ts); legacy-токены (basename) — прежняя логика.
      const worktreesDir = join(memoryRoot, '.git', 'worktrees');
      const live = existsSync(worktreesDir) ? readdirSync(worktreesDir) : [];
      const liveTokens = new Set<string>();
      for (const name of live) {
        try {
          // gitdir-файл записи: путь к <копия>/.git → realpath каталога → WT-ID
          const gitdir = readFileSync(join(worktreesDir, name, 'gitdir'), 'utf-8').trim();
          liveTokens.add(worktreeScopeToken(dirname(gitdir)));
        } catch {
          // запись без читаемого gitdir / каталог копии исчез — токен не живой
        }
      }
      const orphan = new Map<string, number>();
      // один проход store.list — общий для orphan-проверки (WP3) и гигиены лиц (2.17 NFR-02)
      const objects = await store.list();
      for (const o of objects) {
        const s = (o as { scope?: string }).scope;
        if (typeof s !== 'string' || !s.startsWith('worktree:')) continue;
        const token = s.slice('worktree:'.length);
        const alive = /^w-[0-9a-f]{12}$/.test(token) ? liveTokens.has(token) : live.includes(token);
        if (!alive) orphan.set(s, (orphan.get(s) ?? 0) + 1);
      }
      if (orphan.size > 0) {
        console.log();
        console.log('## Orphaned worktree scopes (manual cleanup — promote or edit)');
        for (const [scope, n] of orphan) console.log(`! ${scope}: ${n} object(s) — worktree no longer exists`);
      }

      // 2.17 NFR-02: гигиена канонических лиц. Файлы faces/, не прошедшие
      // контрактную валидацию, в store.list молча выпадают — их видит только
      // scanProblems (прецедент memory-validate.ts); прогон только при
      // существующем каталоге faces, чтобы doctor без лиц не замедлялся.
      const facesSubdir = join(sharedDir(memoryRoot), 'faces');
      const faceProblems = existsSync(facesSubdir)
        ? (await store.scanProblems())
            .filter((p) => p.path.startsWith(facesSubdir + sep))
            .map((p) => ({ path: relative(memoryDir(memoryRoot), p.path), error: p.error }))
        : [];
      const faceFindings = lintFaces(objects, faceProblems);
      if (faceFindings.length > 0) {
        console.log();
        console.log('## Faces (canonical playbooks)');
        for (const f of faceFindings) console.log(`! ${f.file}: ${maskSecrets(f.issue)}`);
      }

      // 2.17.1 REQ-03 (R04, design §3.3): незавершённые операции лица — issue
      // «неполный след мутации» с opId и подсказкой recover; авто-healing
      // doctor не делает (AC-5: обнаружение; исполнение — явная команда).
      const incompleteOps = incompleteFaceOperations(await log.readAll());
      if (incompleteOps.length > 0) {
        console.log();
        console.log('## Face operations (recoverable mutations)');
        for (const o of incompleteOps) {
          const state = o.activated ? 'applied, trail incomplete' : 'not applied';
          console.log(
            `! ${o.opId}: incomplete face mutation trail (${o.command} ${o.ownerSkill}, ${state}) — wolf face recover ${o.opId} [--abort]`
          );
        }
      }
    });
}
