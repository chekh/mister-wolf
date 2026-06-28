export interface ProjectInitializer {
  initialize(baseDir: string): Promise<void>;
}
