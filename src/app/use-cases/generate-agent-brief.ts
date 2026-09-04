import { join } from 'path';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { FileSystem } from '../../ports/file-system.port.js';
import { Clock } from '../../ports/clock.port.js';
import { ProjectSnapshot } from '../../domain/schemas/project-scan-schema.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { briefsDir } from '../../adapters/fs/project-paths.js';

export interface GenerateAgentBriefResult {
  content: string;
  path: string;
  /** Id объектов, попавших в бриф (acceptedMemory + openQuestions + blockers) — P2 D1. */
  injectedIds: string[];
}

export async function generateAgentBrief(
  deps: { store: MemoryStore; fs: FileSystem; clock: Clock },
  root: string,
  snapshot: ProjectSnapshot
): Promise<GenerateAgentBriefResult> {
  const memoryObjects = await deps.store.list();

  const acceptedMemory = memoryObjects
    .filter(
      (obj) =>
        obj.review_state === 'accepted' &&
        obj.status === 'active' &&
        obj.type !== 'context' &&
        obj.type !== 'open-question' &&
        obj.type !== 'blocker'
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 10);

  // Вопросы живут в 'open' (defaultStatus) или 'active' (созданные до введения defaultStatus)
  const openQuestions = memoryObjects
    .filter((obj) => obj.type === 'open-question' && (obj.status === 'open' || obj.status === 'active'))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const blockers = memoryObjects
    .filter((obj) => obj.type === 'blocker' && obj.status === 'active')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const description = await buildProjectDescription(deps.fs, root, snapshot);
  const content = renderBrief(deps.clock, snapshot, description, acceptedMemory, openQuestions, blockers);

  const briefPath = join(briefsDir(root), 'agent-brief-latest.md');
  await deps.fs.writeFile(briefPath, content);

  return { content, path: briefPath, injectedIds: [...acceptedMemory, ...openQuestions, ...blockers].map((o) => o.id) };
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
  blockers: MemoryObject[]
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
