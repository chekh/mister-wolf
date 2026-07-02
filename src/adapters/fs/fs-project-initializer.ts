import * as fs from 'fs/promises';
import { ProjectInitializer } from '../../ports/project-initializer.port.js';
import { MEMORY_TYPES } from '../../domain/memory-types.js';
import { briefsDir, cacheDir, configPath, memoryDir, objectsDir, objectDirForType } from './project-paths.js';

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
    - context
    - work-thread
    - info-request
    - article
    - blocker
    - session-checkpoint
    - rule
search:
   default_limit: 20
`;

export class FsProjectInitializer implements ProjectInitializer {
  async initialize(baseDir: string): Promise<void> {
    await fs.mkdir(memoryDir(baseDir), { recursive: true });
    await fs.mkdir(objectsDir(baseDir), { recursive: true });
    for (const type of MEMORY_TYPES) {
      await fs.mkdir(objectDirForType(baseDir, type), { recursive: true });
    }
    await fs.mkdir(briefsDir(baseDir), { recursive: true });
    await fs.mkdir(cacheDir(baseDir), { recursive: true });
    await fs.writeFile(configPath(baseDir), DEFAULT_CONFIG, 'utf-8');
  }
}
