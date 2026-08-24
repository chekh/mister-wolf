export interface MemoryLock {
  withLock<T>(fn: () => Promise<T>): Promise<T>;
}
