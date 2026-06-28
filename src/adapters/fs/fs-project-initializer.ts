import * as fs from 'fs/promises';
import { join } from 'path';
import { ProjectInitializer } from '../../ports/project-initializer.port.js';
import { cacheDir, configPath, memoryDir, objectsDir } from './project-paths.js';

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

export class FsProjectInitializer implements ProjectInitializer {
  async initialize(baseDir: string): Promise<void> {
    await fs.mkdir(memoryDir(baseDir), { recursive: true });
    await fs.mkdir(objectsDir(baseDir), { recursive: true });
    await fs.mkdir(join(objectsDir(baseDir), 'decisions'), { recursive: true });
    await fs.mkdir(join(objectsDir(baseDir), 'lessons'), { recursive: true });
    await fs.mkdir(join(objectsDir(baseDir), 'observations'), { recursive: true });
    await fs.mkdir(join(objectsDir(baseDir), 'sessions'), { recursive: true });
    await fs.mkdir(join(objectsDir(baseDir), 'documents'), { recursive: true });
    await fs.mkdir(join(objectsDir(baseDir), 'questions'), { recursive: true });
    await fs.mkdir(join(memoryDir(baseDir), 'briefs'), { recursive: true });
    await fs.mkdir(cacheDir(baseDir), { recursive: true });
    await fs.writeFile(configPath(baseDir), DEFAULT_CONFIG, 'utf-8');
  }
}
