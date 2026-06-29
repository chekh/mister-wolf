import { ProjectInitializer } from '../../ports/project-initializer.port.js';

export async function initProjectMemory(initializer: ProjectInitializer, baseDir: string): Promise<void> {
  await initializer.initialize(baseDir);
}
