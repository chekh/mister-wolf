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
    // ensure-без-перезаписи (спека §3.1/§8): 'wx' = создать только если не существует.
    // Существующий config.yaml и память не трогаются — повторный init идемпотентен.
    try {
      await fs.writeFile(configPath(baseDir), renderConfigYaml(null), { encoding: 'utf-8', flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
}
