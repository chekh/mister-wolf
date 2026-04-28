import { StepRunner } from '../types/runner.js';

export class RunnerRegistry {
  private runners = new Map<string, StepRunner>();

  register(runner: StepRunner): void {
    this.runners.set(runner.type, runner);
  }

  get(type: string): StepRunner {
    const runner = this.runners.get(type);
    if (!runner) {
      throw new Error(`Unknown runner: ${type}`);
    }
    return runner;
  }

  list(): string[] {
    return Array.from(this.runners.keys());
  }
}
