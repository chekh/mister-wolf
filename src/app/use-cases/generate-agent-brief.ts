import { join } from 'path';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { FileSystem } from '../../ports/file-system.port.js';
import { Clock } from '../../ports/clock.port.js';
import { ProjectSnapshot } from '../../domain/schemas/project-scan-schema.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { briefsDir } from '../../adapters/fs/project-paths.js';
import { resolveMemoryRoot, type WorktreeIdentity } from '../../adapters/fs/memory-root.js';
import {
  selectMicroNotes,
  type MicroNoteBudget,
  type MicroNoteContext,
  type MicroNoteDeliveryResult,
} from './micro-note-delivery.js';
import { createDeliveryAdmission, createWorktreeVisibility } from './memory-delivery-admission.js';
import {
  JournalStateUnknownError,
  JournalMigrationIncompleteError,
} from '../../adapters/fs/jsonl-micro-note-delivery-log.js';
import type { MicroNoteDeliveryLog, MicroNoteSuppressionRecord } from '../../ports/micro-note-delivery-log.port.js';

export interface GenerateAgentBriefResult {
  content: string;
  path: string;
  /** Id объектов, попавших в бриф (acceptedMemory + openQuestions + blockers) — P2 D1. */
  injectedIds: string[];
  /** 3.2.0 T-09 (REQ-09): адресные micro-notes в брифе (блоки уже в content). */
  microNotes: MicroNoteDeliveryResult | null;
}

export interface GenerateAgentBriefOptions {
  /** Контекст micro-notes; не передан — { environment: process.platform }. */
  microNotes?: { context?: MicroNoteContext; budget?: Partial<MicroNoteBudget> };
  /** REQ-321-2: seam'ы политики допуска (worktree-видимость). Не переданы —
   * токен текущей копии резолвится из root (fs-парс .git, без подпроцессов),
   * резолвер identity — прод-дефолт resolveWorktreeIdentity. */
  admission?: {
    currentScope?: string;
    resolveIdentity?: (baseDir: string) => WorktreeIdentity | null;
  };
}

export async function generateAgentBrief(
  deps: { store: MemoryStore; fs: FileSystem; clock: Clock; noteLog?: MicroNoteDeliveryLog },
  root: string,
  snapshot: ProjectSnapshot,
  options: GenerateAgentBriefOptions = {}
): Promise<GenerateAgentBriefResult> {
  // T013: ровно ОДИН store.list() — MarkdownMemoryStore.list() в любом случае
  // обходит все файлы, type-фильтры не сокращают IO; три фильтрованных вызова
  // дали бы три полных прохода. С parse-кэшем стора это одна walk+stat-проходка.
  const memoryObjects = await deps.store.list();

  // wave13-a §5.4: context/open-question/blocker поглощены note+фасетами —
  // заметки этих фасетов исключены из Active Memory (дублируют секции ниже);
  // старые файлы читаются как note с инжектнутым фасетом (alias-резолвер)
  const isNote = (obj: MemoryObject, facet: string): boolean =>
    obj.type === 'note' && (obj as { facet?: string }).facet === facet;

  // REQ-321-2 (R-2): единая политика допуска во ВСЕХ секциях брифа (Active Memory,
  // Open Questions, Blockers): применимость (AC-2.2), подавление открытым
  // противоречием (AC-2.3), worktree-scope (AC-2.4; токен текущей копии — fs-парс
  // .git из root, как в memory-call), исключение micro-note из legacy-секций
  // (AC-2.1: micro-note доставляется только микро-селектором ниже).
  // REQ-333-4 (ADR-340-2): единственное чтение подавлений; утрата журнала —
  // fail-closed: подавления неизвестны → micro-notes не доставляются вовсе +
  // явная строка в брифе (подсказка restore).
  let suppressions: MicroNoteSuppressionRecord[] = [];
  let suspendedNotice: string | null = null;
  if (deps.noteLog) {
    try {
      suppressions = deps.noteLog.suppressions();
    } catch (e) {
      if (e instanceof JournalStateUnknownError) {
        suspendedNotice =
          'Micro-note delivery suspended: suppression journal state unknown — run `wolf contradict restore`';
      } else if (e instanceof JournalMigrationIncompleteError) {
        // patch 3.4.x review (F3.7): незавершённый перенос журнала — та же
        // приостановка с явным указанием, где перечень отказов; обещаний выдачи нет
        suspendedNotice =
          'Micro-note delivery suspended: journal migration is unfinished — see the refused source(s) in `wolf contradict import` / `wolf contradict restore` output; delivery stays suspended until the migration completes';
      } else {
        throw e;
      }
    }
  }
  const worktree = createWorktreeVisibility({
    currentScope: options.admission?.currentScope ?? resolveMemoryRoot(root).worktree ?? 'main',
    baseDir: root,
    resolveIdentity: options.admission?.resolveIdentity,
  });
  const admission = createDeliveryAdmission({
    context: options.microNotes?.context,
    suppressions,
    worktree,
  });
  const deliverable = (obj: MemoryObject): boolean => admission.admitted(obj as Record<string, unknown>).admitted;

  const acceptedMemory = memoryObjects
    .filter(
      (obj) =>
        obj.review_state === 'accepted' &&
        obj.status === 'active' &&
        deliverable(obj) &&
        !isNote(obj, 'context') &&
        !isNote(obj, 'pitfall')
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 10);

  // Вопросы: note+context без question-поля (статус open; active — legacy alias;
  // скан-объекты отсекаются по source.kind=scan) — та же семантика, что в recap
  const openQuestions = memoryObjects
    .filter((obj) => {
      if (!isNote(obj, 'context') && (obj as { alias_origin?: string }).alias_origin !== 'open-question') return false;
      if (obj.source?.kind === 'scan') return false;
      if (typeof (obj as { question?: unknown }).question === 'string') return false;
      return (
        obj.status === 'open' ||
        (obj.status === 'active' && (obj as { alias_origin?: string }).alias_origin === 'open-question')
      );
    })
    .filter(deliverable)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const blockers = memoryObjects
    .filter((obj) => isNote(obj, 'pitfall') && obj.status === 'active' && deliverable(obj))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  // 3.2.0 T-09 (REQ-09): адресные micro-notes — детерминированная выборка из уже
  // прочитанного списка (без новых проходов, без LLM; NFR-02 бюджет).
  // REQ-333-4: в loss-состоянии доставка приостановлена — секция не рендерится.
  let micro: MicroNoteDeliveryResult | null = null;
  if (suspendedNotice === null) {
    const microCtx: MicroNoteContext = {
      ...(options.microNotes?.context ?? {}),
      environment: options.microNotes?.context?.environment ?? process.platform,
    };
    micro = selectMicroNotes(memoryObjects, microCtx, options.microNotes?.budget, suppressions, worktree);
    if (deps.noteLog) {
      // REQ-333-7 (ADR-340-6): один батч — delivered, затем selected-не-delivered
      // (прежний порядок строк; одна критическая секция журнала на вызов)
      const deliveredNow = new Set(micro.delivered.map((c) => c.id));
      const at = deps.clock.now().toISOString();
      const records = [
        ...micro.delivered.map((candidate) => ({
          memory_id: candidate.id,
          revision: candidate.revision,
          channel: 'brief' as const,
          kind: 'delivered' as const,
          ts: at,
        })),
        ...micro.selected
          .filter((candidate) => !deliveredNow.has(candidate.id))
          .map((candidate) => ({
            memory_id: candidate.id,
            revision: candidate.revision,
            channel: 'brief' as const,
            kind: 'selected' as const,
            ts: at,
          })),
      ];
      deps.noteLog.recordDeliveries(records);
    }
  }

  const description = await buildProjectDescription(deps.fs, root, snapshot);
  const content = renderBrief(
    deps.clock,
    snapshot,
    description,
    acceptedMemory,
    openQuestions,
    blockers,
    micro,
    suspendedNotice
  );

  const briefPath = join(briefsDir(root), 'agent-brief-latest.md');
  await deps.fs.writeFile(briefPath, content);

  return {
    content,
    path: briefPath,
    injectedIds: [...acceptedMemory, ...openQuestions, ...blockers, ...(micro?.delivered ?? [])].map((o) => o.id),
    microNotes: micro,
  };
}

async function buildProjectDescription(fsPort: FileSystem, root: string, snapshot: ProjectSnapshot): Promise<string> {
  const readme = await fsPort.readSmallTextFile(join(root, 'README.md'));
  if (readme) {
    const paragraphs = readme
      .split(/\n\n+/)
      .map((p) =>
        p
          .trim()
          .replace(/^#+\s*/, '')
          .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .trim()
      )
      .filter((p) => p.length > 0);
    const first = paragraphs.slice(0, 2).join('\n\n');
    if (first.length > 20) return first;
  }

  if (snapshot.summary.dependencies.length > 0) {
    return `${snapshot.projectName} is a project built with ${snapshot.summary.languages.join(', ')} and key dependencies including ${snapshot.summary.dependencies.slice(0, 5).join(', ')}.`;
  }

  return `${snapshot.projectName} is a software project.`;
}

function renderListSection(
  title: string,
  items: MemoryObject[],
  emptyMessage: string,
  formatItem: (obj: MemoryObject) => string
): string[] {
  const section = [`## ${title}`];
  for (const obj of items) {
    section.push(formatItem(obj));
    if (obj.body) {
      section.push(`  ${obj.body.split('\n')[0].slice(0, 120)}`);
    }
  }
  if (items.length === 0) section.push(emptyMessage);
  section.push('');
  return section;
}

function renderBrief(
  clock: Clock,
  snapshot: ProjectSnapshot,
  description: string,
  activeMemory: MemoryObject[],
  openQuestions: MemoryObject[],
  blockers: MemoryObject[],
  microNotes: MicroNoteDeliveryResult | null,
  suspendedNotice: string | null = null
): string {
  const lines: string[] = [
    `# Agent Brief: ${snapshot.projectName}`,
    '',
    '## Project Snapshot',
    `- Root: ${snapshot.root}`,
    `- Project name: ${snapshot.projectName}`,
  ];

  if (snapshot.branch) lines.push(`- Branch: ${snapshot.branch}`);
  if (snapshot.commit) lines.push(`- Commit: ${snapshot.commit}`);
  lines.push(`- Generated: ${clock.now().toISOString()}`, '');

  lines.push('## What This Project Is', description, '');

  lines.push(
    '## Technology Stack',
    `- Languages: ${snapshot.summary.languages.join(', ') || 'none'}`,
    `- Key dependencies: ${snapshot.summary.dependencies.slice(0, 10).join(', ') || 'none'}`,
    ''
  );

  lines.push(
    '## Key Files & Entry Points',
    ...snapshot.summary.entryPoints.map((ep) => `- ${ep}`),
    ...snapshot.summary.configFiles.map((cf) => `- ${cf} (config)`),
    ''
  );

  lines.push('## Architecture Notes', renderArchitectureNotes(snapshot), '');

  lines.push(
    ...renderListSection(
      'Active Memory',
      activeMemory,
      '_No active accepted memory._',
      (obj) => `- [${obj.type}] ${obj.title}`
    )
  );

  lines.push(...renderListSection('Open Questions', openQuestions, '_No open questions._', (q) => `- ${q.title}`));

  lines.push(...renderListSection('Blockers', blockers, '_No active blockers._', (b) => `- ${b.title}`));

  // 3.2.0 T-09 (REQ-09): addressed micro-notes with exact id@version (S-17);
  // suppressed-by-contradiction notes are listed for review, not delivered (S-27).
  if (microNotes !== null) {
    if (microNotes.blocks.length > 0) {
      lines.push('## Local Micro-Notes', ...microNotes.blocks, '');
    }
    if (microNotes.underReview.length > 0) {
      lines.push(
        '## Micro-Notes Under Review',
        ...microNotes.underReview.map((u) => `- [${u.id}] conflicting evidence recorded: ${u.reason}`),
        ''
      );
    }
  }
  // REQ-333-4 (ADR-340-2): явная строка приостановки доставки в утрате журнала.
  if (suspendedNotice !== null) {
    lines.push('## Micro-Notes Delivery Suspended', suspendedNotice, '');
  }

  lines.push(
    '## Sources',
    '- Project scan: project-scan-latest',
    '- README.md',
    '- package.json',
    `- Active memory objects: ${activeMemory.length}`,
    ''
  );

  lines.push(
    '## Limitations',
    '- This brief is generated from the latest scan and accepted active memory.',
    '- It may be incomplete if the scan is outdated or memory has not been reviewed.',
    ''
  );

  lines.push(
    '## Recommended First Steps',
    '- Review the active memory and open questions below.',
    '- Read project documentation (README.md, docs/concept-v3.md, AGENTS.md).',
    '- Run the project checks (`npm run check` or equivalent).',
    ''
  );

  return lines.join('\n');
}

function renderArchitectureNotes(snapshot: ProjectSnapshot): string {
  const dirs = snapshot.summary.topLevelDirectories;
  const notes: string[] = [];

  if (dirs.includes('src')) {
    const hasPorts = snapshot.files.some((f) => f.path.includes('/ports/'));
    const hasAdapters = snapshot.files.some((f) => f.path.includes('/adapters/'));
    if (hasPorts && hasAdapters) {
      notes.push('Project appears to use a ports-and-adapters (hexagonal) architecture.');
    }
  }

  if (notes.length === 0) {
    notes.push('No strong architecture signals detected from directory layout.');
  }

  return notes.join(' ');
}
