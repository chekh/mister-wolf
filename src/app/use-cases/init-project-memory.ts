import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { memoryDir, objectsDir, cacheDir, configPath } from '../../adapters/fs/project-paths.js';

const DEFAULT_CONFIG = `# Mr. Wolf Project Memory Configuration
version: 1
memory:
  types:
    - document
    - decision
    - lesson
    - observation
    - session-summary
    - open-question
search:
  default_limit: 20
`;

export async function initProjectMemory(baseDir: string): Promise<void> {
  mkdirSync(memoryDir(baseDir), { recursive: true });
  mkdirSync(objectsDir(baseDir), { recursive: true });
  mkdirSync(join(objectsDir(baseDir), 'decisions'), { recursive: true });
  mkdirSync(join(objectsDir(baseDir), 'lessons'), { recursive: true });
  mkdirSync(join(objectsDir(baseDir), 'observations'), { recursive: true });
  mkdirSync(join(objectsDir(baseDir), 'sessions'), { recursive: true });
  mkdirSync(join(objectsDir(baseDir), 'documents'), { recursive: true });
  mkdirSync(join(objectsDir(baseDir), 'questions'), { recursive: true });
  mkdirSync(join(memoryDir(baseDir), 'briefs'), { recursive: true });
  mkdirSync(cacheDir(baseDir), { recursive: true });
  writeFileSync(configPath(baseDir), DEFAULT_CONFIG, 'utf-8');
}
