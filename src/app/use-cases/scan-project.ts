import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { ProjectScanner } from '../../ports/project-scanner.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { ProjectSnapshot } from '../../domain/schemas/project-scan-schema.js';
import { governanceDefaults } from '../../domain/governance.js';

export interface ScanProjectResult {
  object: MemoryObject;
  snapshot: ProjectSnapshot;
  documents: MemoryObject[];
}

export async function scanProject(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    scanner: ProjectScanner;
    index?: SearchIndex;
  },
  root: string
): Promise<ScanProjectResult> {
  const snapshot = await deps.scanner.scan(root);
  const now = deps.clock.now();
  const actor = 'agent:mr-wolf';
  const defaults = governanceDefaults(actor);

  const object: MemoryObject = {
    id: 'project-scan-latest',
    type: 'context',
    title: `Project scan for ${snapshot.projectName}`,
    body: renderScanBody(snapshot),
    status: 'active',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.7,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: actor,
    schema_version: 1,
    source: { kind: 'scan', path: snapshot.root },
    related: { files: [], docs: [], decisions: [] },
    tags: ['scan'],
    superseded_by: null,
    memory_class: defaults.memory_class,
    truth_role: defaults.truth_role,
    lifetime: defaults.lifetime,
  };

  await deps.store.save(object);
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: 'memory.added',
    timestamp: now.toISOString(),
    actor,
    payload: { memory_id: object.id, type: object.type },
  });
  if (deps.index) {
    await deps.index.indexObject(object);
  }

  const documents = await registerDocuments(deps, snapshot, now, actor);

  return { object, snapshot, documents };
}

async function registerDocuments(
  deps: {
    store: MemoryStore;
    log: EventLog;
    idGen: IdGenerator;
    index?: SearchIndex;
  },
  snapshot: ProjectSnapshot,
  now: Date,
  actor: string
): Promise<MemoryObject[]> {
  const results: MemoryObject[] = [];
  const defaults = governanceDefaults(actor);
  for (const doc of snapshot.docs) {
    const id = `doc_${doc.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const existing = await deps.store.get(id);
    const object: MemoryObject = {
      id,
      type: 'document',
      title: doc.title,
      body: `Registered project document: ${doc.path}`,
      status: 'active',
      review_state: 'accepted',
      confidence: 'high',
      importance: 0.6,
      created_at: existing?.created_at ?? now.toISOString(),
      updated_at: now.toISOString(),
      created_by: existing?.created_by ?? actor,
      schema_version: 1,
      source: { kind: 'scan', path: doc.path },
      related: { files: [], docs: [doc.path], decisions: [] },
      tags: ['document'],
      superseded_by: null,
      memory_class: defaults.memory_class,
      truth_role: defaults.truth_role,
      lifetime: defaults.lifetime,
    };
    await deps.store.save(object);
    if (!existing) {
      await deps.log.append({
        id: deps.idGen.generateEventId(now),
        type: 'memory.added',
        timestamp: now.toISOString(),
        actor,
        payload: { memory_id: object.id, type: object.type },
      });
    }
    if (deps.index) {
      await deps.index.indexObject(object);
    }
    results.push(object);
  }
  return results;
}

export function renderScanBody(snapshot: ProjectSnapshot): string {
  const optionalLine = (label: string, value: string | undefined) => (value ? `- ${label}: ${value}\n` : '');

  const list = (items: string[]) => (items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- none');

  const fileRows = snapshot.files.map((file) => `| ${file.path} | ${file.extension ?? ''} | ${file.size} |`).join('\n');

  return `# Project Scan: ${snapshot.projectName}

## Repository

- Root: ${snapshot.root}
- Project name: ${snapshot.projectName}
${optionalLine('Branch', snapshot.branch)}${optionalLine('Commit', snapshot.commit)}
## Summary

### Languages

${list(snapshot.summary.languages)}

### Entry points

${list(snapshot.summary.entryPoints)}

### Config files

${list(snapshot.summary.configFiles)}

### Dependencies

${list(snapshot.summary.dependencies)}

### Top-level directories

${list(snapshot.summary.topLevelDirectories)}

### File count

- ${snapshot.summary.fileCount}

## Files

| Path | Extension | Size |
|---|---|---|
${fileRows}
`;
}
