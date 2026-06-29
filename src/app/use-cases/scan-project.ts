import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { ProjectScanner } from '../../ports/project-scanner.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { ProjectSnapshot } from '../../domain/schemas/project-scan-schema.js';

export interface ScanProjectResult {
  object: MemoryObject;
  snapshot: ProjectSnapshot;
}

export async function scanProject(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    scanner: ProjectScanner;
  },
  root: string
): Promise<ScanProjectResult> {
  const snapshot = await deps.scanner.scan(root);
  const now = deps.clock.now();
  const actor = 'agent:mr-wolf';

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
  };

  await deps.store.save(object);
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: 'memory.added',
    timestamp: now.toISOString(),
    actor,
    payload: { memory_id: object.id, type: object.type },
  });

  return { object, snapshot };
}

export function renderScanBody(snapshot: ProjectSnapshot): string {
  const optionalLine = (label: string, value: string | undefined) =>
    value ? `- ${label}: ${value}\n` : '';

  const list = (items: string[]) =>
    items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- none';

  const fileRows = snapshot.files
    .map(
      (file) =>
        `| ${file.path} | ${file.extension ?? ''} | ${file.size} |`
    )
    .join('\n');

  return `# Project Scan: ${snapshot.projectName}

## Repository

- Root: ${snapshot.root}
- Project name: ${snapshot.projectName}
${optionalLine('Branch', snapshot.branch)}${optionalLine(
    'Commit',
    snapshot.commit
  )}
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
