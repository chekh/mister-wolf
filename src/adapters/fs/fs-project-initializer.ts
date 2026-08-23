import * as fs from 'fs/promises';
import { ProjectInitializer } from '../../ports/project-initializer.port.js';
import { MEMORY_TYPES } from '../../domain/memory-types.js';
import { renderConfigYaml } from './config-file.js';
import { briefsDir, cacheDir, configPath, memoryDir, objectsDir, objectDirForType } from './project-paths.js';

export class FsProjectInitializer implements ProjectInitializer {
  async initialize(baseDir: string): Promise<void> {
    await fs.mkdir(memoryDir(baseDir), { recursive: true });
    await fs.mkdir(objectsDir(baseDir), { recursive: true });
    for (const type of MEMORY_TYPES) {
      await fs.mkdir(objectDirForType(baseDir, type), { recursive: true });
    }
    await fs.mkdir(briefsDir(baseDir), { recursive: true });
    await fs.mkdir(cacheDir(baseDir), { recursive: true });
    await fs.writeFile(configPath(baseDir), renderConfigYaml(null), 'utf-8');
  }
}
