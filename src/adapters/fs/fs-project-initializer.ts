import * as fs from 'fs/promises';
import { ProjectInitializer } from '../../ports/project-initializer.port.js';
import { renderConfigYaml } from './config-file.js';
import { briefsDir, cacheDir, configPath, memoryDir, threadsDir, sharedDir } from './project-paths.js';

export class FsProjectInitializer implements ProjectInitializer {
  async initialize(baseDir: string): Promise<void> {
    await fs.mkdir(memoryDir(baseDir), { recursive: true });
    await fs.mkdir(threadsDir(baseDir), { recursive: true });
    await fs.mkdir(sharedDir(baseDir), { recursive: true });
    await fs.mkdir(briefsDir(baseDir), { recursive: true });
    await fs.mkdir(cacheDir(baseDir), { recursive: true });
    await fs.writeFile(configPath(baseDir), renderConfigYaml(null), 'utf-8');
  }
}
