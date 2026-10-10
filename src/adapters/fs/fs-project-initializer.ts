import * as fs from 'fs/promises';
import { ProjectInitializer } from '../../ports/project-initializer.port.js';
import { renderConfigYaml } from './config-file.js';
import { briefsDir, cacheDir, configPath, memoryDir, threadsDir, sharedDir } from './project-paths.js';
import { resolveMemoryRoot } from './memory-root.js';

export class FsProjectInitializer implements ProjectInitializer {
  async initialize(baseDir: string): Promise<void> {
    // WP3 §6.1 (2.16): скелет и config — в общий root (main-чекоут для linked worktree)
    const { root } = resolveMemoryRoot(baseDir);
    await fs.mkdir(memoryDir(root), { recursive: true });
    await fs.mkdir(threadsDir(root), { recursive: true });
    await fs.mkdir(sharedDir(root), { recursive: true });
    await fs.mkdir(briefsDir(root), { recursive: true });
    await fs.mkdir(cacheDir(root), { recursive: true });
    // ensure-без-перезаписи (спека §3.1/§8): 'wx' = создать только если не существует.
    // Существующий config.yaml и память не трогаются — повторный init идемпотентен.
    try {
      await fs.writeFile(configPath(root), renderConfigYaml(null), { encoding: 'utf-8', flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
}
