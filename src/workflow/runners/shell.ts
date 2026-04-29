import { StepRunner, ExecutionContext } from '../../types/runner.js';
import { StepDefinition } from '../../types/workflow.js';
import { StepResult } from '../../types/state.js';
import { spawn } from 'child_process';

const DEFAULT_BLOCKED_COMMANDS = ['sudo', 'su', 'ssh', 'vim', 'nano', 'less', 'more', 'top', 'watch'];
const DEFAULT_MAX_OUTPUT_SIZE = 1024 * 1024;
const DEFAULT_TIMEOUT = 30000;
const MAX_TIMEOUT = 300000;

function parseSize(input: string): number {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.endsWith('mb')) {
    const value = parseInt(trimmed.slice(0, -2), 10);
    return isNaN(value) ? DEFAULT_MAX_OUTPUT_SIZE : value * 1024 * 1024;
  }
  if (trimmed.endsWith('kb')) {
    const value = parseInt(trimmed.slice(0, -2), 10);
    return isNaN(value) ? DEFAULT_MAX_OUTPUT_SIZE : value * 1024;
  }
  const value = parseInt(trimmed, 10);
  return isNaN(value) ? DEFAULT_MAX_OUTPUT_SIZE : value;
}

function parseTimeout(input: unknown): number {
  if (typeof input !== 'string') {
    return DEFAULT_TIMEOUT;
  }
  const trimmed = input.trim();
  if (trimmed.endsWith('m')) {
    const minutes = parseInt(trimmed.slice(0, -1), 10);
    if (!isNaN(minutes)) {
      return Math.min(minutes * 60 * 1000, MAX_TIMEOUT);
    }
  }
  if (trimmed.endsWith('s')) {
    const seconds = parseInt(trimmed.slice(0, -1), 10);
    if (!isNaN(seconds)) {
      return Math.min(seconds * 1000, MAX_TIMEOUT);
    }
  }
  const ms = parseInt(trimmed, 10);
  if (!isNaN(ms)) {
    return Math.min(ms, MAX_TIMEOUT);
  }
  return DEFAULT_TIMEOUT;
}

function isBlocked(command: string, blockedCommands: string[]): boolean {
  const trimmed = command.trim();
  const firstWord = trimmed.split(/\s+/)[0];
  return blockedCommands.includes(firstWord);
}

export class ShellRunner implements StepRunner {
  type = 'shell';

  async run(step: StepDefinition, ctx: ExecutionContext): Promise<StepResult> {
    const command = (step.input?.command as string) || '';

    const blockedCommands = ctx.config.defaults?.shell?.blocked_commands ?? DEFAULT_BLOCKED_COMMANDS;
    const maxOutputSize = parseSize(ctx.config.defaults?.shell?.max_output_size ?? '1MB');

    if (!command) {
      return {
        status: 'failure',
        error: {
          type: 'shell_error',
          message: 'No command provided',
          retryable: false,
        },
      };
    }

    if (isBlocked(command, blockedCommands)) {
      return {
        status: 'failure',
        error: {
          type: 'shell_error',
          message: `Command blocked for security: ${command.split(/\s+/)[0]}`,
          retryable: false,
        },
      };
    }

    const timeout = ctx.timeoutMs ?? parseTimeout(step.input?.timeout);

    return new Promise<StepResult>((resolve) => {
      const child = spawn(command, {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });

      let stdout = Buffer.alloc(0);
      let stderr = Buffer.alloc(0);
      let timedOut = false;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        // Kill the entire process group to ensure all subprocesses terminate.
        // detached: true creates a new process group; -pid targets the group.
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => {
        if (stdout.length + data.length > maxOutputSize) {
          stdout = Buffer.concat([stdout, data]).subarray(0, maxOutputSize);
        } else {
          stdout = Buffer.concat([stdout, data]);
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        if (stderr.length + data.length > maxOutputSize) {
          stderr = Buffer.concat([stderr, data]).subarray(0, maxOutputSize);
        } else {
          stderr = Buffer.concat([stderr, data]);
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        resolve({
          status: 'failure',
          error: {
            type: 'shell_error',
            message: err.message,
            retryable: false,
            details: { stderr: stderr.toString() },
          },
        });
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        if (timedOut) {
          resolve({
            status: 'failure',
            error: {
              type: 'TimeoutError',
              message: `Command timed out after ${timeout}ms`,
              retryable: true,
              details: { stderr: stderr.toString() },
            },
          });
          return;
        }
        if (code !== 0) {
          resolve({
            status: 'failure',
            error: {
              type: 'shell_error',
              message: `Command exited with code ${code}`,
              retryable: false,
              details: { stderr: stderr.toString() },
            },
          });
          return;
        }
        resolve({
          status: 'success',
          output: stdout.toString(),
        });
      });
    });
  }
}
