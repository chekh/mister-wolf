import { ProjectSnapshot } from '../domain/schemas/project-scan-schema.js';

export interface ProjectScanner {
  scan(root: string): Promise<ProjectSnapshot>;
}
