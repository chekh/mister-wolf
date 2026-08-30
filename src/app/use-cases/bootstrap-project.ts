import { join } from 'path';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { ProjectScanner } from '../../ports/project-scanner.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { FileSystem } from '../../ports/file-system.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { ProjectSnapshot } from '../../domain/schemas/project-scan-schema.js';
import { UserFacingError } from '../../domain/errors.js';
import type { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { scanProject } from './scan-project.js';
import { addMemoryObject } from './add-memory-object.js';
import { createWorkThread } from './create-work-thread.js';

export interface BootstrapProjectInput {
  baseDir: string;
  createdBy: string;
}

export interface BootstrapProjectResult {
  rules: MemoryObject[];
  workThreadId: string;
  documentCount: number;
  brief: string;
}

interface RuleDraft {
  title: string;
  body: string;
}

/**
 * «Bootstrap-адаптивный» старт памяти проекта (концепт §7.4):
 * скан → черновики правил (proposed) из фактов → work-thread → brief.
 * Свёртку черновиков в принятые правила выполняет Стюард
 * (протокол: docs/guide/steward-bootstrap.md).
 */
export async function bootstrapProject(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    scanner: ProjectScanner;
    index?: SearchIndex;
    lock?: MemoryLock;
    declarations?: readonly MemoryTypeDeclaration[];
    fs: FileSystem;
  },
  input: BootstrapProjectInput
): Promise<BootstrapProjectResult> {
  const config = await deps.fs.readSmallTextFile(join(input.baseDir, '.wolf', 'config.yaml'));
  if (config === null) {
    throw new UserFacingError('Project is not initialized: сначала wolf init');
  }

  const { snapshot, documents } = await scanProject(deps, input.baseDir);
  const testCommand = await readTestCommand(deps.fs, input.baseDir);
  const drafts = draftRulesFromSnapshot(snapshot, testCommand);

  // дедуп при повторе (спека §8): черновик с тем же title уже есть → пропускаем
  const existingProposed = await deps.store.list({ type: 'rule', status: 'proposed' });
  const draftsToCreate = drafts.filter((d) => !existingProposed.some((r) => r.title === d.title));
  const skippedCount = drafts.length - draftsToCreate.length;

  const rules: MemoryObject[] = [];
  for (const draft of draftsToCreate) {
    const { object } = await addMemoryObject(deps, {
      type: 'rule',
      title: draft.title,
      body: draft.body,
      createdBy: input.createdBy,
      status: 'proposed',
      reviewState: 'proposed',
      confidence: 'low',
      importance: 0.3,
      tags: ['bootstrap', 'convention'],
      source: { kind: 'scan', path: snapshot.root },
      extra: { scope: 'project' },
    });
    rules.push(object);
  }

  // дедуп work-thread: повторный bootstrap переиспользует существующий
  const BOOTSTRAP_THREAD_TITLE = 'Bootstrap: наполнение стартовой памяти';
  const existingThread = (await deps.store.list({ type: 'work-thread' })).find((t) => t.title === BOOTSTRAP_THREAD_TITLE);
  let threadId: string;
  if (existingThread) {
    threadId = existingThread.id;
  } else {
    const { object: thread } = await createWorkThread(deps, {
      title: BOOTSTRAP_THREAD_TITLE,
      goal: 'Свёртка черновиков Стюардом в принятые правила',
      currentState: `Создано черновиков правил: ${rules.length}; document-ref'ов: ${documents.length}.`,
      nextSteps: rules.map((rule) => `${rule.id}: ${rule.title}`),
      createdBy: input.createdBy,
    });
    threadId = thread.id;
  }

  return {
    rules,
    workThreadId: threadId,
    documentCount: documents.length,
    brief: renderBrief(rules, documents, threadId, skippedCount),
  };
}

/** Черновики выводятся ТОЛЬКО из фактов snapshot — никаких общих слов. */
function draftRulesFromSnapshot(snapshot: ProjectSnapshot, testCommand: string): RuleDraft[] {
  const drafts: RuleDraft[] = [];

  const { languages, fileCount } = snapshot.summary;
  if (languages.length > 0) {
    drafts.push({
      title: `Стек: ${languages.join(', ')}`,
      body: `Скан проекта «${snapshot.projectName}»: ${fileCount} файлов, языки по расширениям — ${languages.join(', ')}. Подтверди стек и дополни версиями.`,
    });
  }

  drafts.push({
    title: `Проверка проекта: ${testCommand}`,
    body: `Команда проверки проекта (scripts.test из package.json, иначе fallback). Запускай перед завершением работы.`,
  });

  if (snapshot.docs.length > 0) {
    const top = snapshot.docs
      .slice(0, 3)
      .map((doc) => doc.path)
      .join(', ');
    drafts.push({
      title: `Документация: ${snapshot.docs.length} документ(ов)`,
      body: `Зарегистрированные документы: ${top}. Проверь полноту списка и актуальность заголовков (wolf list --type document-ref).`,
    });
  }

  return drafts;
}

async function readTestCommand(fs: FileSystem, baseDir: string): Promise<string> {
  const raw = await fs.readSmallTextFile(join(baseDir, 'package.json'));
  if (raw) {
    try {
      const scripts = (JSON.parse(raw) as { scripts?: Record<string, string> }).scripts;
      const test = scripts?.test;
      if (typeof test === 'string' && test.trim() !== '') return test;
    } catch {
      // битый package.json — fallback ниже
    }
  }
  return 'npm test';
}

function renderBrief(
  rules: MemoryObject[],
  documents: MemoryObject[],
  workThreadId: string,
  skippedCount: number
): string {
  const lines = ['# Bootstrap brief', '', '## Создано'];
  lines.push(`- Proposed rules: ${rules.length}${skippedCount > 0 ? ` (+${skippedCount} already present)` : ''}`);
  for (const rule of rules) {
    lines.push(`  - ${rule.id}: ${rule.title}`);
  }
  lines.push(`- Document-refs: ${documents.length}`);
  lines.push(`- Work-thread: ${workThreadId}`);
  lines.push('');
  lines.push('## Финальный шаг');
  lines.push(
    'Вызови Стюарда (рамка .opencode/agents/steward.md) для свёртки черновиков — протокол: docs/guide/steward-bootstrap.md'
  );
  return lines.join('\n');
}
